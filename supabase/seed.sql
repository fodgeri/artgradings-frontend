-- LOCAL ONLY. `supabase db push` does not apply this file and nothing in this
-- project should ever make it do so — it exists to make an empty local
-- database usable, not to bootstrap any hosted project.
--
-- Every row here is obviously synthetic. No seeded row imitates a real person,
-- order, or graded card: a seed file that resembles production data eventually
-- gets mistaken for it.
-- Both seeded users sign in with the password password123! (local only).

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token
)
values
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated',
   'user@example.test', extensions.crypt('password123!', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000',
   '00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated',
   'admin@example.test', extensions.crypt('password123!', extensions.gen_salt('bf')),
   now(), '{"provider":"email","providers":["email"]}', '{}',
   now(), now(), '', '', '', '', '', '', '', '')
on conflict (id) do nothing;

-- Password sign-in looks the user up through their email identity.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000a1', 'email',
   '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"user@example.test","email_verified":true}',
   now(), now(), now()),
  ('00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000a2', 'email',
   '{"sub":"00000000-0000-0000-0000-0000000000a2","email":"admin@example.test","email_verified":true}',
   now(), now(), now())
on conflict (provider_id, provider) do nothing;

-- The trigger has already granted both the `user` role; the admin needs the
-- extra grant.
insert into public.user_roles (user_id, role_key)
values ('00000000-0000-0000-0000-0000000000a2', 'admin')
on conflict (user_id, role_key) do nothing;

update public.profiles
set first_name = 'Example', last_name = 'User'
where id = '00000000-0000-0000-0000-0000000000a1';

update public.profiles
set first_name = 'Example', last_name = 'Admin'
where id = '00000000-0000-0000-0000-0000000000a2';
