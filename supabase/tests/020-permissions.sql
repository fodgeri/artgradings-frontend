begin;
select plan(4);

select has_function(
  'private', 'has_permission', array['text'],
  'the permission helper exists'
);

select tests.clear_auth();
select tests.create_user('admin1@example.test') as admin_id \gset
insert into public.user_roles (user_id, role_key) values (:'admin_id', 'admin');

select tests.authenticate_as(:'admin_id');
select is(
  private.has_permission('roles.assign'),
  true,
  'an admin holds the permission their role grants'
);

-- The identity check lives INSIDE the function body, which is what makes it
-- safe to grant EXECUTE to authenticated: a caller can only ever ask it about
-- themselves. Verified rather than assumed — a plain user asking about an
-- admin-only permission must get false, not somebody else's answer.
select tests.authenticate_as(tests.create_user('plain@example.test'));
select is(
  private.has_permission('roles.assign'),
  false,
  'a non-admin calling the helper directly is told no'
);

select is(
  private.has_permission('profiles.read_all'),
  false,
  'a non-admin holds no elevated permission'
);

select * from finish();
rollback;
