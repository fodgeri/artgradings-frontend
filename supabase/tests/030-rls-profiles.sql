begin;
select plan(6);

select tests.clear_auth();

-- RLS on every table is asserted here rather than per-table, so a table added
-- later without it fails this test rather than shipping unprotected.
select is(
  (select count(*)::int
   from pg_tables
   where schemaname = 'public' and not rowsecurity),
  0,
  'every table in public has RLS enabled'
);

-- Two ordinary users, created before any impersonation.
select tests.create_user('alice@example.test') as alice_id \gset
select tests.create_user('bob@example.test') as bob_id \gset

-- Alice is an ordinary user; Bob is an admin.
insert into public.user_roles (user_id, role_key) values (:'bob_id', 'admin');

select tests.authenticate_as(:'alice_id');
select is(
  (select count(*)::int from public.profiles),
  1,
  'an ordinary user sees exactly one profile'
);
select is(
  (select id from public.profiles),
  :'alice_id'::uuid,
  'and it is their own'
);

-- Scoped to the two users this test created. An unscoped count would also
-- see the rows seed.sql inserts, and would break the first time the seed
-- file grows.
select tests.authenticate_as(:'bob_id');
select is(
  (select count(*)::int from public.profiles
   where id in (:'alice_id'::uuid, :'bob_id'::uuid)),
  2,
  'an admin sees other users'' profiles via profiles.read_all'
);

-- A user may rename themselves.
select tests.authenticate_as(:'alice_id');
update public.profiles set full_name = 'Alice A' where id = :'alice_id'::uuid;
select is(
  (select full_name from public.profiles where id = :'alice_id'::uuid),
  'Alice A',
  'a user can update their own profile'
);

-- But not anybody else. The update matches no visible row rather than raising.
update public.profiles set full_name = 'hacked' where id = :'bob_id'::uuid;
select tests.clear_auth();
select is(
  (select full_name from public.profiles where id = :'bob_id'::uuid),
  null,
  'a user cannot update another user''s profile'
);

select * from finish();
rollback;
