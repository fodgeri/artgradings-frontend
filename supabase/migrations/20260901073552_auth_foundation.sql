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
