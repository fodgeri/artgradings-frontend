-- Scheduled jobs. Supabase Cron runs them; app jobs are reached over HTTP with
-- a short-lived HMAC signature. The job secret lives only in Vault: it is not
-- in this file, not in cron.job's command text and not in a queued request.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create function private.job_signature(p_job text, p_timestamp bigint, p_secret text)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'v1=' || encode(
    extensions.hmac(p_job || '.' || p_timestamp::text, p_secret, 'sha256'),
    'hex');
$$;

create function private.call_job(p_job text)
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
    url := v_base || '/api/jobs/' || p_job,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-job-timestamp', v_ts::text,
      'x-job-signature', private.job_signature(p_job, v_ts, v_secret)),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000);
end;
$$;

revoke all on function private.job_signature(text, bigint, text) from public, anon, authenticated;
revoke all on function private.call_job(text) from public, anon, authenticated;

-- cron.schedule upserts by name, so this replays from empty.
select cron.schedule('expire-stale-drafts', '7 * * * *', 'select public.expire_stale_drafts()');
select cron.schedule('maintenance', '0 * * * *', $$select private.call_job('maintenance')$$);
select cron.schedule('search-delta', '*/15 * * * *', $$select private.call_job('search-delta')$$);
select cron.schedule('search-rebuild', '30 3 * * 0', $$select private.call_job('search-rebuild')$$);
