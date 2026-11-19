begin;
select plan(15);

select is(
  private.job_signature('search-delta', 1700000000, 'test-secret'),
  'v1=ddd04777c2cff12e41d54cc8289adcc03281c52774b146301d41bd949816acfb',
  'the signature matches the shared test vector'
);

select results_eq(
  $$ select jobname::text, schedule::text from cron.job order by jobname $$,
  $$ values
       ('expire-stale-drafts', '7 * * * *'),
       ('maintenance', '0 * * * *'),
       ('search-delta', '*/15 * * * *'),
       ('search-rebuild', '30 3 * * 0') $$,
  'the four schedules exist'
);

select ok(
  not exists (
    select 1 from cron.job
    where command ilike '%secret%' and jobname <> 'expire-stale-drafts'
      and command not ilike 'select private.call_job(%'
  ),
  'no schedule command carries a secret'
);

select ok(
  not has_function_privilege('authenticated', 'private.call_job(text)', 'execute')
  and not has_function_privilege('anon', 'private.call_job(text)', 'execute')
  and not has_function_privilege('authenticated', 'private.job_signature(text,bigint,text)', 'execute')
  and not has_function_privilege('anon', 'private.job_signature(text,bigint,text)', 'execute'),
  'neither function is executable by anon or authenticated'
);

-- Missing secrets: nothing is called.
delete from vault.secrets where name in ('jobs_base_url', 'jobs_secret');
create temp table before_count as
  select count(*) as n from net.http_request_queue where url like 'http://example.test:3000/%';
select is(private.call_job('search-delta'), null::bigint, 'no secrets: returns null');
select is((select count(*) from net.http_request_queue where url like 'http://example.test:3000/%'), (select n from before_count),
  'no secrets: nothing is queued');

-- Only one of the two present: still nothing.
select vault.create_secret('http://example.test:3000', 'jobs_base_url');
select is(private.call_job('search-delta'), null::bigint, 'one secret missing: returns null');

select vault.create_secret('pgtap-secret-value', 'jobs_secret');
create temp table call_result as select private.call_job('search-delta') as id;
select isnt((select id from call_result), null::bigint, 'with secrets: returns a request id');
select is((select count(*) from net.http_request_queue where url like 'http://example.test:3000/%'), (select n + 1 from before_count),
  'with secrets: one request is queued');
select is((select url from net.http_request_queue where id = (select id from call_result)),
  'http://example.test:3000/api/jobs/search-delta', 'the queued URL is the job route');
select ok(
  (select headers ->> 'x-job-signature' = private.job_signature('search-delta', (headers ->> 'x-job-timestamp')::bigint, 'pgtap-secret-value')
     from net.http_request_queue where id = (select id from call_result)),
  'the queued signature verifies against the test secret'
);
select ok(
  (select headers ->> 'x-job-signature' like 'v1=%' and headers ? 'x-job-timestamp'
     from net.http_request_queue where id = (select id from call_result)),
  'the queued request carries a v1 signature and a timestamp'
);
select ok(
  (select position('pgtap-secret-value' in q::text) = 0
     from (select * from net.http_request_queue where id = (select id from call_result)) q),
  'the secret value appears nowhere in the queued request'
);

-- A trailing slash in the base URL does not double the separator.
delete from vault.secrets where name = 'jobs_base_url';
select vault.create_secret('http://example.test:3000/', 'jobs_base_url');
create temp table slash_result as select private.call_job('search-delta') as id;
select is((select url from net.http_request_queue where id = (select id from slash_result)),
  'http://example.test:3000/api/jobs/search-delta', 'a trailing slash in jobs_base_url is trimmed');
select is(
  (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'catalog_cards'
     and indexdef like '%(set_id)' and indexdef not like '%WHERE%'),
  1::bigint, 'catalog_cards.set_id leads a plain btree index');

select * from finish();
rollback;
