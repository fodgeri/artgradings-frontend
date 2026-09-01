-- LOCAL ONLY. `supabase db push` does not apply this file and nothing in this
-- project should ever make it do so — it exists to make an empty local
-- database usable, not to bootstrap any hosted project.
--
-- Every row here is obviously synthetic. No seeded row imitates a real person,
-- order, or graded card: a seed file that resembles production data eventually
-- gets mistaken for it.

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'user@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin@example.test', '', now(), now(), now())
on conflict (id) do nothing;

-- The trigger has already granted both the `user` role; the admin needs the
-- extra grant.
insert into public.user_roles (user_id, role_key)
values ('00000000-0000-0000-0000-0000000000a2', 'admin')
on conflict (user_id, role_key) do nothing;

update public.profiles
set full_name = 'Example User'
where id = '00000000-0000-0000-0000-0000000000a1';

update public.profiles
set full_name = 'Example Admin'
where id = '00000000-0000-0000-0000-0000000000a2';
