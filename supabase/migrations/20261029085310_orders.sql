-- Orders, their cards, photos, status log and payment attempts.
--
-- A customer writes only a draft, and only the columns granted below. Prices,
-- status, acknowledgements and the reserved catalogue reference are written by
-- security-definer functions (a later migration), never through the Data API.
-- Child tables hold no user id: ownership is proved through the parent order.

-- ── Reference generator ─────────────────────────────────────────────────
--
-- 'AG-' plus 8 Crockford base32 characters from 40 random bits. Random, never
-- sequential, so a reference cannot be guessed from another. Loops until the
-- value is unused. The printed URL /o/<reference> never changes.
create or replace function private.new_order_reference()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea;
  n bigint;
  candidate text;
  i int;
begin
  loop
    bytes := extensions.gen_random_bytes(5);
    n := 0;
    for i in 0..4 loop
      n := (n << 8) | get_byte(bytes, i);
    end loop;
    candidate := 'AG-';
    for i in 0..7 loop
      candidate := candidate || substr(alphabet, ((n >> (35 - 5 * i)) & 31)::int + 1, 1);
    end loop;
    exit when not exists (select 1 from public.orders where reference = candidate);
  end loop;
  return candidate;
end;
$$;
revoke execute on function private.new_order_reference() from public;
-- A column default runs with the inserting user's privileges.
grant execute on function private.new_order_reference() to authenticated;

-- ── Tables ──────────────────────────────────────────────────────────────

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Deleting an account keeps the order, unowned (see CLAUDE.md). The default
  -- is why user_id is in no insert grant.
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  reference text not null unique default private.new_order_reference(),
  status text not null default 'draft' references public.order_statuses (key),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  shipping_method text check (shipping_method in ('postal', 'in_person')),
  contact_first_name text check (char_length(contact_first_name) <= 100),
  contact_last_name text check (char_length(contact_last_name) <= 100),
  contact_phone text check (contact_phone ~ '^\+?[0-9 ()-]{6,30}$'),
  address_country char(2) check (address_country ~ '^[A-Z]{2}$'),
  address_postcode text check (char_length(address_postcode) <= 20),
  address_city text check (char_length(address_city) <= 100),
  address_line text check (char_length(address_line) <= 200),
  inbound_insurance_confirmed boolean not null default false,
  inbound_insurance_confirmed_at timestamptz,
  terms_accepted_at timestamptz,
  terms_version text,
  subtotal_cents bigint,
  inbound_cents bigint,
  return_cents bigint,
  total_cents bigint,
  declared_value_total_cents bigint,
  turnaround_days int,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_id_idx on public.orders (user_id);
-- status is a foreign key, and the admin queue (M5) filters on it.
create index orders_status_idx on public.orders (status);
create unique index orders_one_draft_per_user
  on public.orders (user_id) where status = 'draft';

create table public.order_cards (
  -- Supplied by the client so a card can be addressed before its first save.
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  position int not null,
  identified_by text not null default 'customer' check (identified_by in ('customer', 'art')),
  release_year int check (release_year between 1880 and 2100),
  brand text check (char_length(brand) <= 100),
  language text check (language ~ '^[a-z]{2}$'),
  name text check (char_length(name) <= 200),
  set_name text check (char_length(set_name) <= 200),
  card_number text check (char_length(card_number) <= 50),
  surface text check (char_length(surface) <= 100),
  signed boolean not null default false,
  numbered boolean not null default false,
  declared_value_cents bigint check (declared_value_cents between 1 and 1000000000),
  catalog_ref text,
  service text references public.services (key),
  tier_key text references public.tiers (key),
  price_cents bigint,
  identification_cents bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.order_cards.catalog_ref is
  'Reserved for the card-search change request. In no grant: nothing writes it until that request validates it against a catalogue.';
create index order_cards_order_id_idx on public.order_cards (order_id);
create index order_cards_service_idx on public.order_cards (service);
create index order_cards_tier_key_idx on public.order_cards (tier_key);

create table public.order_card_add_ons (
  card_id uuid not null references public.order_cards (id) on delete cascade,
  add_on_key text not null references public.add_ons (key),
  price_cents bigint,
  primary key (card_id, add_on_key)
);
-- The primary key leads with card_id; add_on_key needs its own index.
create index order_card_add_ons_add_on_key_idx on public.order_card_add_ons (add_on_key);

create table public.card_photos (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.order_cards (id) on delete cascade,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size int not null check (byte_size between 1 and 2097152),
  object_key text generated always as ('card-photos/' || card_id::text || '/' || id::text) stored,
  created_at timestamptz not null default now(),
  -- One photo per card (MAX_PHOTOS_PER_CARD). The constraint's index also
  -- covers the foreign key.
  constraint card_photos_card_id_key unique (card_id)
);

create table public.order_status_log (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status text references public.order_statuses (key),
  to_status text not null references public.order_statuses (key),
  actor text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_log_order_id_idx on public.order_status_log (order_id);
create index order_status_log_actor_user_id_idx on public.order_status_log (actor_user_id);
create index order_status_log_from_status_idx on public.order_status_log (from_status);
create index order_status_log_to_status_idx on public.order_status_log (to_status);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null,
  provider_reference text not null,
  outcome text check (outcome in ('succeeded', 'failed')),
  amount_cents bigint not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (provider, provider_reference)
);
create index payment_attempts_order_id_idx on public.payment_attempts (order_id);

-- Object keys whose rows are gone; the maintenance job removes them from R2.
create table private.photo_deletions (
  object_key text primary key,
  queued_at timestamptz not null default now()
);
alter table private.photo_deletions enable row level security;

-- ── Triggers ────────────────────────────────────────────────────────────
-- The three below are security definer: the customer's column grants do not
-- reach orders.updated_at or the private queue, and must not.

create trigger orders_set_updated_at
before update on public.orders
for each row execute function private.set_updated_at();

create trigger order_cards_set_updated_at
before update on public.order_cards
for each row execute function private.set_updated_at();

create or replace function private.touch_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if tg_table_name = 'order_cards' then
    target := coalesce(new.order_id, old.order_id);
  else
    select c.order_id into target from public.order_cards c
    where c.id = coalesce(new.card_id, old.card_id);
  end if;
  -- Null when the whole order is being cascade-deleted.
  if target is not null then
    update public.orders set updated_at = now() where id = target;
  end if;
  return null;
end;
$$;
revoke execute on function private.touch_order() from public;

create trigger order_cards_touch_order
after insert or update or delete on public.order_cards
for each row execute function private.touch_order();
create trigger order_card_add_ons_touch_order
after insert or update or delete on public.order_card_add_ons
for each row execute function private.touch_order();
create trigger card_photos_touch_order
after insert or update or delete on public.card_photos
for each row execute function private.touch_order();

create or replace function private.enforce_card_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.order_cards where order_id = new.order_id) >= 50 then
    raise exception 'too_many_cards' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function private.enforce_card_limit() from public;

create trigger order_cards_enforce_limit
before insert on public.order_cards
for each row execute function private.enforce_card_limit();

create or replace function private.queue_photo_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.photo_deletions (object_key) values (old.object_key)
  on conflict do nothing;
  return null;
end;
$$;
revoke execute on function private.queue_photo_deletion() from public;

create trigger card_photos_queue_deletion
after delete on public.card_photos
for each row execute function private.queue_photo_deletion();

-- ── Row Level Security ──────────────────────────────────────────────────

alter table public.orders             enable row level security;
alter table public.order_cards        enable row level security;
alter table public.order_card_add_ons enable row level security;
alter table public.card_photos        enable row level security;
alter table public.order_status_log   enable row level security;
alter table public.payment_attempts   enable row level security;

revoke all on public.orders, public.order_cards, public.order_card_add_ons,
              public.card_photos, public.order_status_log, public.payment_attempts
  from anon, authenticated;

grant select on public.orders, public.order_cards, public.order_card_add_ons,
                public.card_photos, public.order_status_log, public.payment_attempts
  to authenticated;

grant insert (shipping_method, contact_first_name, contact_last_name, contact_phone,
              address_country, address_postcode, address_city, address_line,
              inbound_insurance_confirmed)
  on public.orders to authenticated;
grant update (shipping_method, contact_first_name, contact_last_name, contact_phone,
              address_country, address_postcode, address_city, address_line,
              inbound_insurance_confirmed)
  on public.orders to authenticated;

grant insert (id, order_id, position, identified_by, release_year, brand, language, name,
              set_name, card_number, surface, signed, numbered, declared_value_cents,
              service, tier_key)
  on public.order_cards to authenticated;
grant update (position, identified_by, release_year, brand, language, name, set_name,
              card_number, surface, signed, numbered, declared_value_cents,
              service, tier_key)
  on public.order_cards to authenticated;
grant delete on public.order_cards to authenticated;

grant insert (card_id, add_on_key) on public.order_card_add_ons to authenticated;
grant delete on public.order_card_add_ons to authenticated;
grant insert (id, card_id, content_type, byte_size) on public.card_photos to authenticated;
grant delete on public.card_photos to authenticated;

-- orders: the status check in `with check` keeps a customer from touching an
-- order once it has left draft; user_id comes from the column default.
create policy "Customers read their own orders" on public.orders
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Customers open a draft" on public.orders
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'draft');
create policy "Customers edit their draft" on public.orders
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'draft')
  with check (user_id = (select auth.uid()) and status = 'draft');

-- order_cards
create policy "Customers read their cards" on public.order_cards
  for select to authenticated using (exists (
    select 1 from public.orders o
    where o.id = order_cards.order_id and o.user_id = (select auth.uid())));
create policy "Customers add cards to their draft" on public.order_cards
  for insert to authenticated with check (exists (
    select 1 from public.orders o
    where o.id = order_cards.order_id and o.user_id = (select auth.uid()) and o.status = 'draft'));
create policy "Customers edit cards in their draft" on public.order_cards
  for update to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_cards.order_id and o.user_id = (select auth.uid()) and o.status = 'draft'))
  with check (exists (
    select 1 from public.orders o
    where o.id = order_cards.order_id and o.user_id = (select auth.uid()) and o.status = 'draft'));
create policy "Customers remove cards from their draft" on public.order_cards
  for delete to authenticated using (exists (
    select 1 from public.orders o
    where o.id = order_cards.order_id and o.user_id = (select auth.uid()) and o.status = 'draft'));

-- order_card_add_ons
create policy "Customers read their card add-ons" on public.order_card_add_ons
  for select to authenticated using (exists (
    select 1 from public.order_cards c join public.orders o on o.id = c.order_id
    where c.id = order_card_add_ons.card_id and o.user_id = (select auth.uid())));
create policy "Customers add add-ons in their draft" on public.order_card_add_ons
  for insert to authenticated with check (exists (
    select 1 from public.order_cards c join public.orders o on o.id = c.order_id
    where c.id = order_card_add_ons.card_id and o.user_id = (select auth.uid()) and o.status = 'draft'));
create policy "Customers remove add-ons from their draft" on public.order_card_add_ons
  for delete to authenticated using (exists (
    select 1 from public.order_cards c join public.orders o on o.id = c.order_id
    where c.id = order_card_add_ons.card_id and o.user_id = (select auth.uid()) and o.status = 'draft'));

-- card_photos
create policy "Customers read their card photos" on public.card_photos
  for select to authenticated using (exists (
    select 1 from public.order_cards c join public.orders o on o.id = c.order_id
    where c.id = card_photos.card_id and o.user_id = (select auth.uid())));
create policy "Customers add photos in their draft" on public.card_photos
  for insert to authenticated with check (exists (
    select 1 from public.order_cards c join public.orders o on o.id = c.order_id
    where c.id = card_photos.card_id and o.user_id = (select auth.uid()) and o.status = 'draft'));
create policy "Customers remove photos from their draft" on public.card_photos
  for delete to authenticated using (exists (
    select 1 from public.order_cards c join public.orders o on o.id = c.order_id
    where c.id = card_photos.card_id and o.user_id = (select auth.uid()) and o.status = 'draft'));

-- log and payments: read-only, own orders
create policy "Customers read their order log" on public.order_status_log
  for select to authenticated using (exists (
    select 1 from public.orders o
    where o.id = order_status_log.order_id and o.user_id = (select auth.uid())));
create policy "Customers read their payment attempts" on public.payment_attempts
  for select to authenticated using (exists (
    select 1 from public.orders o
    where o.id = payment_attempts.order_id and o.user_id = (select auth.uid())));
