begin;
select plan(12);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'roles', 'roles exists');
select has_table('public', 'permissions', 'permissions exists');
select has_table('public', 'user_roles', 'user_roles exists');
select has_table('public', 'role_permissions', 'role_permissions exists');

select col_type_is('public', 'profiles', 'id', 'uuid', 'profiles.id is uuid');
select col_type_is(
  'public', 'profiles', 'created_at', 'timestamp with time zone',
  'timestamps are timezone-aware'
);

-- A column counts as indexed only when it leads a btree index, so the
-- composite primary keys do not cover these two.
-- Written as a catalogue query rather than has_index(): the four-argument
-- form of has_index is ambiguous with its (schema, table, index, column)
-- overload and may not resolve.
select ok(
  (select count(*) from pg_indexes
   where indexname = 'user_roles_role_key_idx') = 1,
  'the trailing FK column of user_roles is indexed'
);
select ok(
  (select count(*) from pg_indexes
   where indexname = 'role_permissions_permission_key_idx') = 1,
  'the trailing FK column of role_permissions is indexed'
);

select is(
  (select count(*)::int from public.roles),
  2,
  'both roles are seeded'
);
select is(
  (select count(*)::int from public.permissions),
  3,
  'every permission that backs a policy is seeded'
);
select is(
  (select count(*)::int from public.role_permissions where role_key = 'user'),
  0,
  'the user role is granted nothing'
);

select * from finish();
rollback;
