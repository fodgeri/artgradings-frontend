-- System functions: payment results, draft expiry, the R2 deletion queue and
-- account-deletion preparation.
--
-- The first five are callable by service_role only. prepare_account_deletion
-- runs as the caller, through auth.uid(), and is granted to authenticated.

-- ── Payment ─────────────────────────────────────────────────────────────

create or replace function public.record_payment_success(
  p_order_id uuid, p_provider text, p_provider_reference text,
  p_amount_cents bigint, p_currency text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  -- Serialise on the order, so two deliveries of one webhook cannot both pass.
  select * into o from public.orders where id = p_order_id for update;

  if exists (select 1 from public.payment_attempts
             where provider = p_provider and provider_reference = p_provider_reference) then
    return 'duplicate';
  end if;

  if not found
     or o.status <> 'awaiting_payment'
     or o.total_cents is distinct from p_amount_cents
     or o.currency <> p_currency then
    return 'rejected';
  end if;

  insert into public.payment_attempts (order_id, provider, provider_reference, outcome, amount_cents, currency)
  values (p_order_id, p_provider, p_provider_reference, 'succeeded', p_amount_cents, p_currency);
  perform private.transition_order(p_order_id, 'paid', 'system', null);
  return 'recorded';
end;
$$;

create or replace function public.record_payment_failure(
  p_order_id uuid, p_provider text, p_provider_reference text,
  p_amount_cents bigint, p_currency text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_attempts (order_id, provider, provider_reference, outcome, amount_cents, currency)
  values (p_order_id, p_provider, p_provider_reference, 'failed', p_amount_cents, p_currency)
  on conflict (provider, provider_reference) do nothing;
end;
$$;

-- ── Expiry and the R2 deletion queue ────────────────────────────────────

-- Children go with the order (cascade); the photo trigger queues their objects.
create or replace function public.expire_stale_drafts()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  with gone as (
    delete from public.orders
    where status = 'draft' and updated_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into n from gone;
  return n;
end;
$$;

-- A photo row deleted and re-inserted under the same id leaves its key queued
-- while the object is live again, so keys that still have a row are withheld.
create or replace function public.list_photo_deletions(p_limit int)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select d.object_key
  from private.photo_deletions d
  where not exists (select 1 from public.card_photos p where p.object_key = d.object_key)
  order by d.queued_at, d.object_key
  limit greatest(p_limit, 0);
$$;

create or replace function public.complete_photo_deletions(p_keys text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.photo_deletions where object_key = any (p_keys);
$$;

-- ── Account deletion ────────────────────────────────────────────────────

-- Run by the signed-in user before the admin client deletes the account.
-- Orders that are unfinished block deletion; the rest are removed, or kept
-- unowned with their personal fields scrubbed (the user_id goes null on the
-- account's deletion).
create or replace function public.prepare_account_deletion()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.orders where user_id = v_uid
             and status in ('paid', 'received', 'grading', 'graded', 'shipped_back')) then
    return 'orders_in_progress';
  end if;

  delete from public.orders o
  where o.user_id = v_uid
    and (o.status in ('draft', 'awaiting_payment')
         or (o.status = 'cancelled' and not exists (
               select 1 from public.payment_attempts a
               where a.order_id = o.id and a.outcome = 'succeeded')));

  update public.orders
  set contact_first_name = null, contact_last_name = null, contact_phone = null,
      address_country = null, address_postcode = null, address_city = null,
      address_line = null
  where user_id = v_uid;

  return 'ok';
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────

revoke execute on function public.record_payment_success(uuid, text, text, bigint, text) from public, anon, authenticated;
revoke execute on function public.record_payment_failure(uuid, text, text, bigint, text) from public, anon, authenticated;
revoke execute on function public.expire_stale_drafts() from public, anon, authenticated;
revoke execute on function public.list_photo_deletions(int) from public, anon, authenticated;
revoke execute on function public.complete_photo_deletions(text[]) from public, anon, authenticated;
revoke execute on function public.prepare_account_deletion() from public, anon;

grant execute on function public.record_payment_success(uuid, text, text, bigint, text) to service_role;
grant execute on function public.record_payment_failure(uuid, text, text, bigint, text) to service_role;
grant execute on function public.expire_stale_drafts() to service_role;
grant execute on function public.list_photo_deletions(int) to service_role;
grant execute on function public.complete_photo_deletions(text[]) to service_role;
grant execute on function public.prepare_account_deletion() to authenticated;
