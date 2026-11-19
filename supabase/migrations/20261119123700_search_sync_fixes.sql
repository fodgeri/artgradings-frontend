-- Review fixes for the search-sync migration.

-- 1. A copy repointed from card X to card Y changes X's counts too; bump X so
--    the delta job re-indexes it. (Y surfaces through the copy's own updated_at.)
create function private.touch_old_card_on_repoint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.catalog_cards set updated_at = now() where id = old.catalog_card_id;
  return null;
end;
$$;
revoke all on function private.touch_old_card_on_repoint() from public;

create trigger graded_copies_touch_old_card
after update of catalog_card_id on public.graded_copies
for each row
when (old.catalog_card_id is distinct from new.catalog_card_id)
execute function private.touch_old_card_on_repoint();

-- 2. The lease belongs to the run that took it.
alter table private.job_runs add column current_started_at timestamptz;

create or replace function public.begin_job_run(p_job text, p_lease_seconds int)
returns table (acquired boolean, started_at timestamptz, previous_success_started_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev timestamptz;
  v_taken boolean;
begin
  if p_lease_seconds is null or p_lease_seconds <= 0 then
    raise exception 'invalid_lease' using errcode = '22023';
  end if;

  insert into private.job_runs (job) values (p_job) on conflict (job) do nothing;

  update private.job_runs j
  set lease_until = now() + make_interval(secs => p_lease_seconds),
      current_started_at = now()
  where j.job = p_job and (j.lease_until is null or j.lease_until < now())
  returning j.last_success_started_at into v_prev;
  v_taken := found;

  if not v_taken then
    select j.last_success_started_at into v_prev from private.job_runs j where j.job = p_job;
  end if;

  return query select v_taken, now(), v_prev;
end;
$$;

create or replace function public.finish_job_run(p_job text, p_started_at timestamptz, p_success boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.job_runs j
  set lease_until = case when j.current_started_at = p_started_at then null else j.lease_until end,
      current_started_at = case when j.current_started_at = p_started_at then null else j.current_started_at end,
      last_finished_at = now(),
      last_success_started_at = case when p_success
        then greatest(coalesce(j.last_success_started_at, '-infinity'::timestamptz), p_started_at)
        else j.last_success_started_at end
  where j.job = p_job
$$;
