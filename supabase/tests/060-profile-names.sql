-- The name columns' limits. The application enforces the same rule in
-- lib/auth/profile-name.ts; these checks hold whatever writes the row.
begin;
select plan(6);

select tests.clear_auth();
select tests.create_user('names@example.test') as uid \gset
select tests.authenticate_as(:'uid');

-- Inside $$ psql variables are not interpolated, so each statement targets
-- the impersonated user through auth.uid().
select lives_ok(
  $$update public.profiles
       set first_name = repeat('a', 100), last_name = repeat('b', 100)
     where id = auth.uid()$$,
  '100-character names are accepted'
);

-- char_length counts characters, not bytes: 100 two-byte letters still fit.
select lives_ok(
  $$update public.profiles set first_name = repeat('é', 100) where id = auth.uid()$$,
  'the limit counts characters, not bytes'
);

select throws_ok(
  $$update public.profiles set first_name = repeat('a', 101) where id = auth.uid()$$,
  '23514', null,
  'a 101-character first name is rejected'
);

select throws_ok(
  $$update public.profiles set last_name = repeat('b', 101) where id = auth.uid()$$,
  '23514', null,
  'a 101-character last name is rejected'
);

-- Absent is null, never the empty string, so "has a name" is `is not null`.
select throws_ok(
  $$update public.profiles set first_name = '' where id = auth.uid()$$,
  '23514', null,
  'an empty name is rejected'
);

select lives_ok(
  $$update public.profiles set first_name = null, last_name = null where id = auth.uid()$$,
  'names can be cleared to null'
);

select * from finish();
rollback;
