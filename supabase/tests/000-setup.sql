-- Runs first. Defines the pgTAP extension and the impersonation helpers every
-- other test file uses.
--
-- These helpers are written here rather than installed from
-- `basejump-supabase_test_helpers` via dbdev deliberately: CI runs on a public
-- repository against a persistent self-hosted runner whose user is in the
-- docker group, and pulling a third-party Postgres extension into that
-- environment on every run is not an exposure worth accepting for forty lines
-- of SQL.

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;

-- The helpers are called while impersonating, so the impersonated roles need
-- to reach them. Without this, `tests.clear_auth()` fails with "permission
-- denied for schema tests" the moment a test switches identity — the schema is
-- reachable only by the role that installed it.
--
-- This grant is safe because nothing here is a migration: `supabase/tests/` is
-- read by `supabase test db` against a local, disposable database and never
-- reaches any hosted project.
grant usage on schema tests to authenticated, anon;

-- Creates a confirmed auth user and returns its id. Inserting into auth.users
-- is what fires the provisioning trigger, so this is also how that trigger is
-- exercised.
create or replace function tests.create_user(email text)
returns uuid
language plpgsql
as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  values (
    uid, '00000000-0000-0000-0000-000000000000', 'authenticated',
    'authenticated', email, '', now(), now(), now()
  );
  return uid;
end;
$$;

-- Switches the session to the `authenticated` Postgres role and sets the JWT
-- claims that auth.uid() reads. Both are set LOCAL, so a rollback restores the
-- previous identity and tests cannot leak into each other.
create or replace function tests.authenticate_as(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- Returns to the superuser identity, for assertions that must see every row.
create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- pg_prove treats every file under `supabase/tests/` as a test file, so this
-- one needs a plan of its own or the run fails with "No plan found in TAP
-- output" no matter how the real tests fare. Asserting the helpers exist is
-- the honest thing to assert here: it catches a typo in a signature at the
-- point of installation rather than three files later.
begin;
select plan(3);

select has_function('tests', 'create_user', array['text'], 'create_user is installed');
select has_function('tests', 'authenticate_as', array['uuid'], 'authenticate_as is installed');
select has_function('tests', 'clear_auth', 'clear_auth is installed');

select * from finish();
rollback;

-- Redundant today — Postgres grants function EXECUTE to PUBLIC by default — but
-- stated explicitly so the helpers keep working if a later migration tightens
-- default privileges. The schema-level USAGE above is the gate that actually
-- fails without it.
grant execute on all functions in schema tests to authenticated, anon;
