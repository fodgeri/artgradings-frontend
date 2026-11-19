-- Final-review fixes.
-- 1. search_changed_card_ids returned `setof uuid`, which PostgREST truncates at
--    max_rows (1000) while the delta still advanced its watermark. A single
--    uuid[] is one row, so nothing is cut.
-- 2. catalog_cards.set_id was covered only by a partial unique index; give the
--    foreign key (and the set join above) a plain btree index.
-- 3. call_job tolerates a trailing slash in the Vault jobs_base_url.
drop function public.search_changed_card_ids(timestamptz);

create function public.search_changed_card_ids(p_since timestamptz)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(id), '{}'::uuid[]) from (
    select cc.id from public.catalog_cards cc where cc.updated_at >= p_since
    union
    select cc.id from public.catalog_cards cc
    join public.card_sets s on s.id = cc.set_id
    where s.updated_at >= p_since
    union
    select c.catalog_card_id from public.graded_copies c where c.updated_at >= p_since
  ) changed(id)
$$;

revoke execute on function public.search_changed_card_ids(timestamptz) from public, anon, authenticated;
grant execute on function public.search_changed_card_ids(timestamptz) to service_role;

create index catalog_cards_set_id_idx on public.catalog_cards (set_id);

create or replace function private.call_job(p_job text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_secret text;
  v_ts bigint := extract(epoch from now())::bigint;
begin
  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'jobs_base_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'jobs_secret';
  if v_base is null or v_secret is null then
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_base, '/') || '/api/jobs/' || p_job,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-job-timestamp', v_ts::text,
      'x-job-signature', private.job_signature(p_job, v_ts, v_secret)),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000);
end;
$$;
