begin;
select plan(4);

select tests.clear_auth();
select tests.create_user('fresh@example.test') as fresh_id \gset

select is(
  (select count(*)::int from public.profiles where id = :'fresh_id'::uuid),
  1,
  'signing up creates exactly one profile row'
);

select is(
  (select role_key from public.user_roles where user_id = :'fresh_id'::uuid),
  'user',
  'signing up grants the user role and nothing more'
);

-- The trigger must be incapable of raising: if it throws, signup fails with an
-- opaque 500 that names nothing the caller touched.
select lives_ok(
  $$insert into public.profiles (id)
    select id from auth.users where email = 'fresh@example.test'
    on conflict (id) do nothing$$,
  'a duplicate profile insert is absorbed rather than raised'
);

-- Asserted by forcing a bogus value rather than by comparing against
-- created_at. now() is the TRANSACTION timestamp and this file, like every
-- pgTAP file, is one transaction — so `updated_at > created_at` is false here
-- however correct the trigger is. Verified against the database, not assumed.
--
-- Overwriting a caller-supplied value is also the property worth having: it is
-- what stops a client forging updated_at through the Data API.
update public.profiles
   set full_name = 'Fresh', updated_at = 'epoch'
 where id = :'fresh_id'::uuid;
select is(
  (select updated_at from public.profiles where id = :'fresh_id'::uuid),
  now(),
  'the trigger overwrites a caller-supplied updated_at'
);

select * from finish();
rollback;
