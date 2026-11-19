-- Search-sync reads and the job lease. Service role only, except overdue_jobs()
-- (job names only, read by /api/health). Population always comes from
-- private.card_population / private.is_public_card, never re-derived.

create table private.job_runs (
  job text primary key,
  last_success_started_at timestamptz,
  lease_until timestamptz,
  last_finished_at timestamptz
);
alter table private.job_runs enable row level security;
revoke all on private.job_runs from public, anon, authenticated;

create function public.begin_job_run(p_job text, p_lease_seconds int)
returns table (acquired boolean, started_at timestamptz, previous_success_started_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev timestamptz;
  v_taken boolean;
begin
  insert into private.job_runs (job) values (p_job) on conflict (job) do nothing;

  update private.job_runs j
  set lease_until = now() + make_interval(secs => p_lease_seconds)
  where j.job = p_job and (j.lease_until is null or j.lease_until < now())
  returning j.last_success_started_at into v_prev;
  v_taken := found;

  if not v_taken then
    select j.last_success_started_at into v_prev from private.job_runs j where j.job = p_job;
  end if;

  return query select v_taken, now(), v_prev;
end;
$$;

create function public.finish_job_run(p_job text, p_started_at timestamptz, p_success boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.job_runs j
  set lease_until = null,
      last_finished_at = now(),
      last_success_started_at = case when p_success then p_started_at else j.last_success_started_at end
  where j.job = p_job
$$;

create function public.overdue_jobs()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(t.job order by t.job), '{}'::text[])
  from (values
    ('maintenance', interval '3 hours'),
    ('search-delta', interval '45 minutes'),
    ('search-rebuild', interval '8 days')
  ) as t (job, max_age)
  left join private.job_runs j on j.job = t.job
  where j.last_success_started_at is null or j.last_success_started_at < now() - t.max_age
$$;

create function public.search_changed_card_ids(p_since timestamptz)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cc.id from public.catalog_cards cc where cc.updated_at >= p_since
  union
  select cc.id from public.catalog_cards cc
  join public.card_sets s on s.id = cc.set_id
  where s.updated_at >= p_since
  union
  select c.catalog_card_id from public.graded_copies c where c.updated_at >= p_since
$$;

create function public.search_public_card_ids(p_after uuid, p_limit int)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cc.id
  from public.catalog_cards cc
  where cc.id > coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid)
    and private.is_public_card(cc.id)
  order by cc.id
  limit least(p_limit, 1000)
$$;

create function public.search_card_documents(p_card_ids uuid[])
returns table (id uuid, name text, card_number text, number_key text, variant text, rarity text,
               set_id uuid, set_name text, set_code text, series text, language text,
               release_year int, category text, kind text, grade_counts jsonb,
               authentic_count int, total int, autograph_total int, grades_present text[],
               latest_published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select cc.id, cc.name, cc.card_number, cc.number_key, cc.variant, cc.rarity,
         s.id, s.name, s.code, s.series, s.language, s.release_year, s.category, cat.kind,
         p.grade_counts, p.authentic_count, p.total, p.autograph_total,
         (select coalesce(array_agg(keys.k order by keys.k), '{}'::text[]) from (
            select jsonb_object_keys(p.grade_counts) as k
            union all
            select 'authentic' where p.authentic_count > 0
          ) keys),
         (select max(c.published_at) from public.graded_copies c
          where c.catalog_card_id = cc.id
            and c.published_at is not null and c.withdrawn_at is null
            and c.card_authentication is distinct from 'not_genuine')
  from public.catalog_cards cc
  join public.card_sets s on s.id = cc.set_id
  join public.catalog_categories cat on cat.key = s.category
  cross join lateral private.card_population(cc.id) p
  where cc.id = any (p_card_ids) and private.is_public_card(cc.id)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'begin_job_run(text, int)', 'finish_job_run(text, timestamptz, boolean)',
    'search_changed_card_ids(timestamptz)', 'search_public_card_ids(uuid, int)',
    'search_card_documents(uuid[])'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

revoke execute on function public.overdue_jobs() from public;
grant execute on function public.overdue_jobs() to anon, authenticated, service_role;
