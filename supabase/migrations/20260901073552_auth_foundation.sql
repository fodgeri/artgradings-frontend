-- Profiles, roles, permissions, and the RLS that protects them.
--
-- Policies in this project name a PERMISSION, never a role. Adding a role
-- later is an INSERT into role_permissions and changes no policy.

create schema if not exists private;

-- ── Tables ──────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Roles are a business concept and may one day be managed by an admin screen,
-- so they are rows. Adding one is an INSERT.
create table public.roles (
  key text primary key,
  label text not null
);

-- Permissions are a code concept: one is meaningful only when a policy
-- references it, so they arrive by migration alongside that policy. They are
-- a table rather than an enum because `alter type ... add value` cannot have
-- its value used in the transaction that adds it, and each migration runs in
-- one — which would split every future permission migration in two.
create table public.permissions (
  key text primary key,
  description text not null
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_key text not null references public.roles (key),
  primary key (user_id, role_key)
);

create table public.role_permissions (
  role_key text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);

-- The composite primary keys index their LEADING column only. Postgres counts
-- a column as indexed just when it comes first in a btree, so the trailing
-- foreign keys need their own.
create index user_roles_role_key_idx on public.user_roles (role_key);
create index role_permissions_permission_key_idx
  on public.role_permissions (permission_key);

-- ── Reference data ──────────────────────────────────────────────────────

insert into public.roles (key, label) values
  ('user',  'User'),
  ('admin', 'Administrator');

-- Only permissions that back a policy created in this migration. Orders,
-- grading and refunds bring their own when those tables land in M3/M5.
insert into public.permissions (key, description) values
  ('profiles.read_all', 'Read every user profile'),
  ('roles.read_all',    'Read every user''s role assignments'),
  ('roles.assign',      'Grant and revoke roles');

insert into public.role_permissions (role_key, permission_key) values
  ('admin', 'profiles.read_all'),
  ('admin', 'roles.read_all'),
  ('admin', 'roles.assign');

-- ── The permission helper ───────────────────────────────────────────────
--
-- `security definer` is required, not stylistic. The function reads
-- user_roles, whose own policy calls the function; the bypass comes from
-- running as the tables' owner, and owners are exempt from RLS. This is also
-- why RLS is enabled but never FORCEd below — FORCE removes that exemption,
-- and the function would silently return false for everyone.
create or replace function private.has_permission(requested text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = (select auth.uid())
      and rp.permission_key = requested
  );
$$;

-- EXECUTE is GRANTED, not revoked. Policy expressions are evaluated with the
-- privileges of the querying user, so revoking this makes every query against
-- a protected table fail with `permission denied for function`. Tested.
--
-- What keeps the function safe is that auth.uid() is read inside its body, so
-- a caller can only ask about themselves; and that `private` is not a
-- PostgREST-exposed schema, so it is not reachable over the Data API.
grant usage on schema private to authenticated;
grant execute on function private.has_permission(text) to authenticated;

-- ── Provisioning ────────────────────────────────────────────────────────
--
-- Every insert is `on conflict do nothing` because this function must be
-- incapable of raising. If it throws, signup fails with an opaque 500 giving
-- no indication that the cause was a trigger on a table the application never
-- writes to directly.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role_key)
  values (new.id, 'user')
  on conflict (user_id, role_key) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- now() is the transaction timestamp deliberately: rows updated together share
-- a stamp, matching created_at's default. The point of the trigger is that the
-- value is the server's, not the caller's — a client cannot forge updated_at
-- through the Data API.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();
