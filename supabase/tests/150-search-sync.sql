begin;
select plan(21);

insert into public.card_sets (id, category, name, code, language, release_year, series) values
  ('00000000-0000-0000-0000-0000000004b1', 'pokemon', 'Sync Set', 'SS', 'en', 2022, 'Sync Series'),
  ('00000000-0000-0000-0000-0000000004b2', 'pokemon', 'Other Set', null, 'en', 2023, null);
insert into public.catalog_cards (id, set_id, card_number, name, variant, rarity) values
  ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004b1', '1', 'Sync A', null, 'Rare'),
  ('00000000-0000-0000-0000-0000000004a2', '00000000-0000-0000-0000-0000000004b1', '2', 'Sync B', null, null),
  ('00000000-0000-0000-0000-0000000004a3', '00000000-0000-0000-0000-0000000004b1', '3', 'Sync C', null, null),
  ('00000000-0000-0000-0000-0000000004a4', '00000000-0000-0000-0000-0000000004b2', '4', 'Sync D', null, null);
insert into public.catalog_cards (id, set_id, card_number, name, merged_into) values
  ('00000000-0000-0000-0000-0000000004a5', '00000000-0000-0000-0000-0000000004b1', '1', 'Sync E', '00000000-0000-0000-0000-0000000004a1');

insert into public.graded_copies
  (cert_number, catalog_card_id, service, card_grade, autograph_grade, card_authentication, autograph_authentication, finalized_at, published_at, withdrawn_at) values
  ('ART-S0000001', '00000000-0000-0000-0000-0000000004a1', 'grading', 'g10', null, null, null, now(), now() - interval '2 hour', null),
  ('ART-S0000002', '00000000-0000-0000-0000-0000000004a1', 'authentication', null, null, 'genuine', null, now(), now() - interval '10 minutes', null),
  ('ART-S0000003', '00000000-0000-0000-0000-0000000004a2', 'grading', 'g9', null, null, null, now(), now(), now()),
  ('ART-S0000004', '00000000-0000-0000-0000-0000000004a3', 'grading', 'g8', null, null, null, now(), now(), null),
  ('ART-S0000005', '00000000-0000-0000-0000-0000000004a5', 'grading', 'g8', null, null, null, now(), now(), null),
  ('ART-S0000006', '00000000-0000-0000-0000-0000000004a4', 'grading', 'g7', null, null, null, now(), now(), null);

-- The touch trigger stamps now(), which is the transaction start for every row;
-- age everything so "changed since" is measurable.
alter table public.card_sets disable trigger card_sets_touch_updated_at;
alter table public.catalog_cards disable trigger catalog_cards_touch_updated_at;
alter table public.graded_copies disable trigger graded_copies_touch_updated_at;
update public.card_sets set updated_at = now() - interval '1 day';
update public.catalog_cards set updated_at = now() - interval '1 day';
update public.graded_copies set updated_at = now() - interval '1 day';
alter table public.card_sets enable trigger card_sets_touch_updated_at;
alter table public.catalog_cards enable trigger catalog_cards_touch_updated_at;
alter table public.graded_copies enable trigger graded_copies_touch_updated_at;

-- overdue_jobs is callable by anyone and, on a fresh DB, names all three jobs.
select set_config('role', 'anon', true);
select is((select array_agg(j order by j) from unnest(public.overdue_jobs()) j),
  array['maintenance','search-delta','search-rebuild'], 'a fresh DB has every job overdue');
select throws_ok($$select * from public.begin_job_run('search-delta', 600)$$, '42501', null, 'anon cannot begin a job run');
select throws_ok($$select * from public.search_card_documents(array[gen_random_uuid()])$$, '42501', null, 'anon cannot read search documents');
select throws_ok($$select * from public.search_changed_card_ids(now())$$, '42501', null, 'anon cannot read changed ids');
select throws_ok($$select * from public.search_public_card_ids(null, 10)$$, '42501', null, 'anon cannot page public ids');
select throws_ok($$select public.finish_job_run('search-delta', now(), true)$$, '42501', null, 'anon cannot finish a job run');
select set_config('role', 'service_role', true);

-- Lease
create temp table first_run as select * from public.begin_job_run('search-delta', 600);
grant select on first_run to service_role;
select ok((select acquired from first_run), 'the first begin acquires the lease');
select is((select previous_success_started_at from first_run), null, 'no previous success yet');
select ok(not (select acquired from public.begin_job_run('search-delta', 600)), 'a second begin while leased does not acquire');

select public.finish_job_run('search-delta', now() - interval '10 minutes', true);
select is((select previous_success_started_at from public.begin_job_run('search-delta', 600)), now() - interval '10 minutes',
  'after a successful finish the next begin sees that start as previous success');
select public.finish_job_run('search-delta', now(), false);
select is((select previous_success_started_at from public.begin_job_run('search-delta', 600)), now() - interval '10 minutes',
  'a failed finish leaves the previous success unchanged');
select public.finish_job_run('search-delta', now(), false);

select ok(not ('search-delta' = any (public.overdue_jobs())), 'a job with a recent success is not overdue');
select ok('maintenance' = any (public.overdue_jobs()), 'a job that never succeeded is overdue');
select public.finish_job_run('search-delta', now() - interval '2 hour', true);
select ok('search-delta' = any (public.overdue_jobs()), 'a job whose last success is older than its threshold is overdue');

-- Changed ids
select is((select count(*)::int from public.search_changed_card_ids(now() - interval '1 minute')), 0, 'nothing changed yet');
reset role;
update public.card_sets set name = 'Sync Set 2' where id = '00000000-0000-0000-0000-0000000004b1';
select set_config('role', 'service_role', true);
select is((select array_agg(i order by i) from public.search_changed_card_ids(now() - interval '1 minute') i),
  array['00000000-0000-0000-0000-0000000004a1','00000000-0000-0000-0000-0000000004a2','00000000-0000-0000-0000-0000000004a3','00000000-0000-0000-0000-0000000004a5']::uuid[],
  'updating a set surfaces all its cards');
reset role;
update public.graded_copies set card_grade = 'g7' where cert_number = 'ART-S0000006';
select set_config('role', 'service_role', true);
select ok('00000000-0000-0000-0000-0000000004a4'::uuid in (select i from public.search_changed_card_ids(now() - interval '1 minute') i),
  'updating a copy surfaces its card');

-- Public ids and documents
select is((select array_agg(i order by i) from public.search_public_card_ids(null, 100) i),
  array['00000000-0000-0000-0000-0000000004a1','00000000-0000-0000-0000-0000000004a3','00000000-0000-0000-0000-0000000004a4']::uuid[],
  'public ids exclude withdrawn-only and merged cards');
select is((select array_agg(i) from public.search_public_card_ids('00000000-0000-0000-0000-0000000004a1', 1) i),
  array['00000000-0000-0000-0000-0000000004a3']::uuid[], 'paging resumes after the cursor and honours the limit');

select is((select array_agg(id order by id) from public.search_card_documents(
  array['00000000-0000-0000-0000-0000000004a1','00000000-0000-0000-0000-0000000004a2','00000000-0000-0000-0000-0000000004a5']::uuid[])),
  array['00000000-0000-0000-0000-0000000004a1']::uuid[], 'documents omit a withdrawn-only card and a merged card');
select is((select grades_present from public.search_card_documents(array['00000000-0000-0000-0000-0000000004a1']::uuid[])),
  array['authentic','g10'], 'grades_present holds the grade keys plus authentic');

select * from finish();
rollback;
