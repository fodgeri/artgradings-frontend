begin;
select plan(8);

select tests.clear_auth();
select tests.create_user('carol@example.test') as carol_id \gset
select tests.create_user('dave@example.test') as dave_id \gset
insert into public.user_roles (user_id, role_key) values (:'dave_id', 'admin');

-- Reference data is the system's vocabulary, not anybody's data.
select tests.authenticate_as(:'carol_id');
select ok(
  (select count(*) from public.roles) = 2,
  'an ordinary user can read the roles table'
);
select ok(
  (select count(*) from public.permissions) = 3,
  'an ordinary user can read the permissions table'
);

-- Reference data has no write policy, so writes are refused.
select throws_ok(
  $$insert into public.roles (key, label) values ('sneaky', 'Sneaky')$$,
  '42501',
  null,
  'an ordinary user cannot write reference data'
);

-- Role assignment requires roles.assign, which only admin holds.
select throws_ok(
  format(
    $$insert into public.user_roles (user_id, role_key) values (%L, 'admin')$$,
    :'carol_id'
  ),
  '42501',
  null,
  'an ordinary user cannot grant themselves a role'
);

select is(
  (select count(*)::int from public.user_roles),
  1,
  'an ordinary user sees only their own role assignment'
);

-- An admin holding roles.assign may grant.
select tests.authenticate_as(:'dave_id');
insert into public.user_roles (user_id, role_key) values (:'carol_id', 'admin');
select is(
  (select count(*)::int from public.user_roles where user_id = :'carol_id'::uuid),
  2,
  'an admin can grant a role'
);

-- `anon` is the identity every unauthenticated browser holds, so the
-- `revoke all ... from anon` in the migration is the one line here that a
-- mistake would expose publicly. It has no policy on these tables either, but
-- the grant is what fails first and what is asserted.
select tests.clear_auth();
select set_config('role', 'anon', true);
select throws_ok(
  $$select * from public.profiles$$,
  '42501',
  null,
  'a signed-out visitor cannot read profiles'
);
select throws_ok(
  $$select * from public.user_roles$$,
  '42501',
  null,
  'a signed-out visitor cannot read role assignments'
);

select * from finish();
rollback;
