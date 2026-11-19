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

-- One open draft for user@example.test, so /submit and /account have
-- something to show on a fresh database. Obviously fake: "Example Card" in
-- "Example Set". Only columns a customer can write through the Data API are
-- set here, plus the owner (which the app takes from auth.uid()); status,
-- reference and prices come from the defaults and functions, as they would
-- for a real draft. Inserting the order logs its creation through the
-- orders_log_created trigger. Its ids sit in their own `5eed` range: the pgTAP
-- suite runs against this seeded database and uses fixed ids of its own.
insert into public.orders (id, user_id)
values ('00000000-0000-0000-0000-0000005eed01',
        '00000000-0000-0000-0000-0000000000a1')
on conflict (id) do nothing;

insert into public.order_cards (
  id, order_id, position, identified_by, release_year, brand, language,
  name, set_name, card_number, declared_value_cents, service, tier_key
)
values ('00000000-0000-0000-0000-0000005eed02',
        '00000000-0000-0000-0000-0000005eed01', 0, 'customer', 2000,
        'Example Brand', 'en', 'Example Card', 'Example Set', '1/100',
        1000, 'grading', 'grading_standard')
on conflict (id) do nothing;

-- Pop Report sample data (M4). Obviously synthetic: "Example" names and
-- TEST-#### certificate numbers, a range real numbers can never use. Ids sit
-- in the `5eed` range. Covers: several grades incl. halves, authentic-only,
-- dual with a genuine and with a forged signature, unpublished, withdrawn and
-- not-genuine copies. 12 published card-graded copies, so the landing page's
-- switch to real slabs (at 8) shows locally.
insert into public.card_sets (id, category, name, code, language, release_year, series, total_cards)
values
  ('00000000-0000-0000-0000-0000005eed10', 'pokemon', 'Example Base Set', 'EXB', 'en', 1999, 'Example Series', 102),
  ('00000000-0000-0000-0000-0000005eed11', 'pokemon', 'Example Japanese Set', 'EXJ', 'ja', 2001, 'Example Series', 80),
  ('00000000-0000-0000-0000-0000005eed12', 'basketball', 'Example Hoops', 'EXH', 'en', 2003, null, null)
on conflict (id) do nothing;

insert into public.catalog_cards (id, set_id, card_number, name, variant, rarity, merged_into)
values
  ('00000000-0000-0000-0000-0000005eed20', '00000000-0000-0000-0000-0000005eed10', '4/102', 'Example Flamewing', null, 'Holo Rare', null),
  ('00000000-0000-0000-0000-0000005eed21', '00000000-0000-0000-0000-0000005eed10', '44/102', 'Example Sprout', null, 'Common', null),
  ('00000000-0000-0000-0000-0000005eed22', '00000000-0000-0000-0000-0000005eed10', '7/102', 'Example Tidepool', null, 'Rare', null),
  ('00000000-0000-0000-0000-0000005eed23', '00000000-0000-0000-0000-0000005eed10', '4/102', 'Example Flamewing', '1st Edition', 'Holo Rare', null),
  ('00000000-0000-0000-0000-0000005eed24', '00000000-0000-0000-0000-0000005eed11', '1', 'Example Dragonet', null, 'Rare', null),
  ('00000000-0000-0000-0000-0000005eed25', '00000000-0000-0000-0000-0000005eed11', '25', 'Example Moonfox', null, 'Uncommon', null),
  ('00000000-0000-0000-0000-0000005eed26', '00000000-0000-0000-0000-0000005eed12', '23', 'Example Guard', null, null, null),
  ('00000000-0000-0000-0000-0000005eed27', '00000000-0000-0000-0000-0000005eed12', '5', 'Example Center', null, null, null),
  ('00000000-0000-0000-0000-0000005eed28', '00000000-0000-0000-0000-0000005eed12', '101', 'Example Rookie', 'Rookie Auto', null, null),
  ('00000000-0000-0000-0000-0000005eed29', '00000000-0000-0000-0000-0000005eed12', '7', 'Example Winger', null, null, null),
  ('00000000-0000-0000-0000-0000005eed2a', '00000000-0000-0000-0000-0000005eed12', '12', 'Example Forward', null, null, null)
on conflict (id) do nothing;

-- A duplicate of Example Flamewing #4 that was merged into the canonical card;
-- /pop-report/cards/<this id> redirects to the canonical one.
insert into public.catalog_cards (id, set_id, card_number, name, merged_into)
values ('00000000-0000-0000-0000-0000005eed2b', '00000000-0000-0000-0000-0000005eed10',
        '004/102', 'Example Flamewing (duplicate)', '00000000-0000-0000-0000-0000005eed20')
on conflict (id) do nothing;

insert into public.graded_copies (
  cert_number, catalog_card_id, order_card_id, service, card_grade,
  autograph_grade, card_authentication, autograph_authentication,
  finalized_at, published_at, withdrawn_at
)
values
  ('TEST-0001', '00000000-0000-0000-0000-0000005eed20', '00000000-0000-0000-0000-0000005eed02', 'grading', 'g10', null, null, null, now(), now(), null),
  ('TEST-0002', '00000000-0000-0000-0000-0000005eed20', null, 'grading', 'g9_5', null, null, null, now(), now(), null),
  ('TEST-0003', '00000000-0000-0000-0000-0000005eed20', null, 'grading', 'g9', null, null, null, now(), now(), null),
  ('TEST-0004', '00000000-0000-0000-0000-0000005eed21', null, 'grading', 'g8_5', null, null, null, now(), now(), null),
  ('TEST-0005', '00000000-0000-0000-0000-0000005eed22', null, 'grading', 'g10', null, null, null, now(), now(), null),
  ('TEST-0006', '00000000-0000-0000-0000-0000005eed23', null, 'grading', 'g7', null, null, null, now(), now(), null),
  ('TEST-0007', '00000000-0000-0000-0000-0000005eed24', null, 'grading', 'g9', null, null, null, now(), now(), null),
  ('TEST-0008', '00000000-0000-0000-0000-0000005eed25', null, 'grading', 'g8', null, null, null, now(), now(), null),
  ('TEST-0009', '00000000-0000-0000-0000-0000005eed26', null, 'grading', 'g10', null, null, null, now(), now(), null),
  ('TEST-0010', '00000000-0000-0000-0000-0000005eed27', null, 'grading', 'g6_5', null, null, null, now(), now(), null),
  -- authentic only
  ('TEST-0011', '00000000-0000-0000-0000-0000005eed21', null, 'authentication', null, null, 'genuine', null, now(), now(), null),
  -- dual: card grade plus an autograph grade
  ('TEST-0012', '00000000-0000-0000-0000-0000005eed28', null, 'dual', 'g9', 'g10', null, 'genuine', now(), now(), null),
  -- dual: card grade, forged signature
  ('TEST-0013', '00000000-0000-0000-0000-0000005eed28', null, 'dual', 'g8', null, null, 'not_genuine', now(), now(), null),
  -- finalized, not yet published
  ('TEST-0014', '00000000-0000-0000-0000-0000005eed29', null, 'grading', 'g9', null, null, null, now(), null, null),
  -- published, then withdrawn
  ('TEST-0015', '00000000-0000-0000-0000-0000005eed29', null, 'grading', 'g9', null, null, null, now(), now(), now()),
  -- the card itself is not genuine
  ('TEST-0016', '00000000-0000-0000-0000-0000005eed2a', null, 'authentication', null, null, 'not_genuine', null, now(), now(), null)
on conflict (cert_number) do nothing;

-- Local-only Vault secrets for the scheduled app jobs (private.call_job).
-- Hosted projects set their own per docs/deployment/SEARCH_SETUP.md; these
-- values must never be used there. Guarded so a re-seed does not duplicate.
select vault.create_secret('http://host.docker.internal:3000', 'jobs_base_url')
where not exists (select 1 from vault.secrets where name = 'jobs_base_url');
select vault.create_secret('local-jobs-secret', 'jobs_secret')
where not exists (select 1 from vault.secrets where name = 'jobs_secret');
