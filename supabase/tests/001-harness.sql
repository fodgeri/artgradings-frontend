begin;
select plan(3);

select ok(
  tests.create_user('harness@example.test') is not null,
  'create_user returns an id'
);

select tests.authenticate_as(tests.create_user('who@example.test'));
select is(
  current_setting('role'),
  'authenticated',
  'authenticate_as switches the Postgres role'
);

select tests.clear_auth();
select is(
  current_setting('role'),
  'postgres',
  'clear_auth restores the superuser identity'
);

select * from finish();
rollback;
