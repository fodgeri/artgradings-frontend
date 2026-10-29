-- The order state machine, pricing, submit and cancel.
--
-- Everything that changes `orders.status` or writes a price lives here, in
-- security-definer functions. A customer reaches only quote_order,
-- submit_order and cancel_order; the private.* functions are not callable by
-- any API role. Every refusal is `raise exception '<code>' using errcode =
-- 'P0001'`, which the application maps by code.

-- ── The one place status is written ─────────────────────────────────────

create or replace function private.transition_order(
  p_order_id uuid, p_to text, p_actor text, p_actor_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
begin
  select status into v_from from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.order_transitions
    where from_status = v_from and to_status = p_to and actor = p_actor
  ) then
    raise exception 'transition_not_allowed' using errcode = 'P0001';
  end if;
  update public.orders set status = p_to where id = p_order_id;
  insert into public.order_status_log (order_id, from_status, to_status, actor, actor_user_id)
  values (p_order_id, v_from, p_to, p_actor, p_actor_user_id);
end;
$$;
revoke execute on function private.transition_order(uuid, text, text, uuid) from public;

-- Creation is a transition from nothing; the log records it.
create or replace function private.log_order_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_status_log (order_id, from_status, to_status, actor, actor_user_id)
  values (new.id, null, new.status, 'customer', new.user_id);
  return null;
end;
$$;
revoke execute on function private.log_order_created() from public;

create trigger orders_log_created
after insert on public.orders
for each row execute function private.log_order_created();

-- ── Pricing ─────────────────────────────────────────────────────────────

create or replace function private.price_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  c record;
  a record;
  v_tier public.tiers%rowtype;
  v_tier_price public.tier_prices%rowtype;
  v_card_price bigint;
  v_ident bigint;
  v_ident_fee bigint;
  v_addons jsonb;
  v_cards jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_declared bigint := 0;
  v_turnaround int := 0;
  v_inbound bigint := 0;
  v_return bigint := 0;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select amount_cents into v_ident_fee from public.card_fee_prices
  where fee_key = 'identification' and currency = o.currency;

  for c in
    select oc.*, s.active as service_active, s.requires_signed
    from public.order_cards oc
    left join public.services s on s.key = oc.service
    where oc.order_id = p_order_id
    order by oc.position
  loop
    if c.service is null or c.service_active is distinct from true
       or (c.requires_signed and not c.signed) then
      raise exception 'service_unavailable' using errcode = 'P0001';
    end if;

    select * into v_tier from public.tiers where key = c.tier_key;
    if not found or not v_tier.active or v_tier.service <> c.service then
      raise exception 'tier_unavailable' using errcode = 'P0001';
    end if;
    select * into v_tier_price from public.tier_prices
    where tier_key = v_tier.key and currency = o.currency;
    if not found then
      raise exception 'tier_unavailable' using errcode = 'P0001';
    end if;
    if v_tier_price.max_declared_value_cents is not null
       and c.declared_value_cents > v_tier_price.max_declared_value_cents then
      raise exception 'declared_value_over_cap' using errcode = 'P0001';
    end if;

    v_card_price := v_tier_price.amount_cents;
    v_addons := '[]'::jsonb;
    for a in
      select aoc.add_on_key, ap.amount_cents, ao.active, (aos.service is not null) as applies
      from public.order_card_add_ons aoc
      left join public.add_ons ao on ao.key = aoc.add_on_key
      left join public.add_on_services aos
        on aos.add_on_key = aoc.add_on_key and aos.service = c.service
      left join public.add_on_prices ap
        on ap.add_on_key = aoc.add_on_key and ap.currency = o.currency
      where aoc.card_id = c.id
      order by aoc.add_on_key
    loop
      if a.active is distinct from true or not a.applies or a.amount_cents is null then
        raise exception 'add_on_unavailable' using errcode = 'P0001';
      end if;
      v_card_price := v_card_price + a.amount_cents;
      v_addons := v_addons || jsonb_build_object('key', a.add_on_key, 'price_cents', a.amount_cents);
    end loop;

    v_ident := 0;
    if c.identified_by = 'art' then
      if v_ident_fee is null then
        raise exception 'incomplete' using errcode = 'P0001';
      end if;
      v_ident := v_ident_fee;
    end if;
    v_card_price := v_card_price + v_ident;

    v_subtotal := v_subtotal + v_card_price;
    v_declared := v_declared + coalesce(c.declared_value_cents, 0);
    v_turnaround := greatest(v_turnaround, v_tier.turnaround_days);
    v_cards := v_cards || jsonb_build_object(
      'card_id', c.id, 'price_cents', v_card_price,
      'identification_cents', v_ident, 'add_ons', v_addons);
  end loop;

  -- Postal orders pay the zone's shipping; in-person orders pay none.
  if o.shipping_method = 'postal' then
    select p.inbound_cents, p.return_cents into v_inbound, v_return
    from public.shipping_zone_countries z
    join public.shipping_zone_prices p on p.zone_key = z.zone_key and p.currency = o.currency
    where z.country_code = o.address_country;
    if not found then
      raise exception 'country_unsupported' using errcode = 'P0001';
    end if;
  end if;

  return jsonb_build_object(
    'currency', o.currency,
    'cards', v_cards,
    'subtotal_cents', v_subtotal,
    'inbound_cents', v_inbound,
    'return_cents', v_return,
    'total_cents', v_subtotal + v_inbound + v_return,
    'declared_value_total_cents', v_declared,
    'turnaround_days', v_turnaround);
end;
$$;
revoke execute on function private.price_order(uuid) from public;

-- ── What a customer calls ───────────────────────────────────────────────

create or replace function public.quote_order()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.orders
  where user_id = auth.uid() and status = 'draft';
  if v_id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return private.price_order(v_id);
end;
$$;

create or replace function public.submit_order(p_terms_version text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
  v_quote jsonb;
  v_card jsonb;
  v_addon jsonb;
  v_max_year int := extract(year from now())::int + 1;
begin
  if nullif(btrim(p_terms_version), '') is null or char_length(p_terms_version) > 100 then
    raise exception 'incomplete' using errcode = 'P0001';
  end if;

  select * into o from public.orders
  where user_id = auth.uid() and status = 'draft'
  for update;
  if not found then
    if exists (select 1 from public.orders
               where user_id = auth.uid() and status = 'awaiting_payment') then
      raise exception 'not_draft' using errcode = 'P0001';
    end if;
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- Completeness. Pricing runs after, so a half-filled card is "incomplete"
  -- rather than whatever the pricing happens to trip on first.
  if not exists (select 1 from public.order_cards where order_id = o.id)
     or exists (
       select 1 from public.order_cards c
       where c.order_id = o.id and (
         c.declared_value_cents is null or c.service is null or c.tier_key is null
         or (c.identified_by = 'customer' and (
           c.release_year is null
           or nullif(btrim(c.brand), '') is null
           or c.language is null
           or nullif(btrim(c.name), '') is null
           or nullif(btrim(c.set_name), '') is null
           or nullif(btrim(c.card_number), '') is null))
         or c.release_year > v_max_year))
     or o.shipping_method is null
     or nullif(btrim(o.contact_first_name), '') is null
     or nullif(btrim(o.contact_last_name), '') is null
     or o.contact_phone is null
     or (o.shipping_method = 'postal' and (
       o.address_country is null
       or nullif(btrim(o.address_postcode), '') is null
       or nullif(btrim(o.address_city), '') is null
       or nullif(btrim(o.address_line), '') is null
       or not o.inbound_insurance_confirmed))
  then
    raise exception 'incomplete' using errcode = 'P0001';
  end if;

  v_quote := private.price_order(o.id);

  for v_card in select * from jsonb_array_elements(v_quote -> 'cards') loop
    update public.order_cards
    set price_cents = (v_card ->> 'price_cents')::bigint,
        identification_cents = (v_card ->> 'identification_cents')::bigint
    where id = (v_card ->> 'card_id')::uuid;
    for v_addon in select * from jsonb_array_elements(v_card -> 'add_ons') loop
      update public.order_card_add_ons
      set price_cents = (v_addon ->> 'price_cents')::bigint
      where card_id = (v_card ->> 'card_id')::uuid and add_on_key = v_addon ->> 'key';
    end loop;
  end loop;

  -- Timestamps are the server's: a value the customer wrote through the Data
  -- API would be forgeable.
  update public.orders
  set subtotal_cents = (v_quote ->> 'subtotal_cents')::bigint,
      inbound_cents = (v_quote ->> 'inbound_cents')::bigint,
      return_cents = (v_quote ->> 'return_cents')::bigint,
      total_cents = (v_quote ->> 'total_cents')::bigint,
      declared_value_total_cents = (v_quote ->> 'declared_value_total_cents')::bigint,
      turnaround_days = (v_quote ->> 'turnaround_days')::int,
      submitted_at = now(),
      terms_accepted_at = now(),
      terms_version = p_terms_version,
      inbound_insurance_confirmed_at =
        case when o.shipping_method = 'postal' then now() end
  where id = o.id;

  update public.profiles
  set first_name = coalesce(first_name, nullif(btrim(o.contact_first_name), '')),
      last_name = coalesce(last_name, nullif(btrim(o.contact_last_name), ''))
  where id = auth.uid() and (first_name is null or last_name is null);

  perform private.transition_order(o.id, 'awaiting_payment', 'customer', auth.uid());
  return o.reference;
end;
$$;

create or replace function public.cancel_order(p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.orders
  where reference = p_reference and user_id = auth.uid();
  if v_id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform private.transition_order(v_id, 'cancelled', 'customer', auth.uid());
end;
$$;

revoke execute on function public.quote_order() from public, anon;
revoke execute on function public.submit_order(text) from public, anon;
revoke execute on function public.cancel_order(text) from public, anon;
grant execute on function public.quote_order() to authenticated;
grant execute on function public.submit_order(text) to authenticated;
grant execute on function public.cancel_order(text) to authenticated;

-- ── Children follow the parent's status ─────────────────────────────────
--
-- The child-table policies prove 'draft' with a non-locking read against the
-- statement snapshot, so a write racing submit_order could land after the
-- order was priced. This guard takes a locking read of the parent instead: it
-- waits for submit's FOR UPDATE, then sees the committed status. FOR NO KEY
-- UPDATE also serialises concurrent card inserts on one order, which is what
-- makes enforce_card_limit's count safe.
--
-- A missing parent is not an error: deleting an order (a draft, by the
-- maintenance job or account deletion) cascades into its children after the
-- parent row is gone.
create or replace function private.require_draft_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order uuid;
  v_status text;
begin
  if tg_table_name = 'order_cards' then
    v_order := coalesce(new.order_id, old.order_id);
  else
    select c.order_id into v_order from public.order_cards c
    where c.id = coalesce(new.card_id, old.card_id);
  end if;
  if v_order is not null then
    select status into v_status from public.orders
    where id = v_order for no key update;
    if found and v_status <> 'draft' then
      raise exception 'not_draft' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function private.require_draft_order() from public;

-- Same-timing triggers fire alphabetically by name. order_cards_00_* sorts
-- before order_cards_enforce_limit, so the lock is held when it counts.
create trigger order_cards_00_require_draft
before insert or update or delete on public.order_cards
for each row execute function private.require_draft_order();
create trigger order_card_add_ons_00_require_draft
before insert or update or delete on public.order_card_add_ons
for each row execute function private.require_draft_order();
create trigger card_photos_00_require_draft
before insert or update or delete on public.card_photos
for each row execute function private.require_draft_order();
