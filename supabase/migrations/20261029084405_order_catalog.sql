-- The order catalog: statuses, the transitions between them, and everything
-- a customer can buy, as data.
--
-- Nothing here is written through the Data API. Rows arrive by migration (and
-- by an admin screen in M5, which will bring its own permission and policies).
-- Every price is per currency so a second currency is an INSERT, not a schema
-- change; only EUR exists today.

-- ── Statuses and transitions ────────────────────────────────────────────
--
-- Tables, not enums, for the same reason `permissions` is: `alter type ... add
-- value` cannot be used in the transaction that adds it, and each migration
-- runs in one.
create table public.order_statuses (
  key text primary key,
  position int not null unique
);

-- The order state machine lives here, in one place. A null from_status is the
-- creation of an order. `actor` says who may make the move; the functions that
-- perform it (later migrations) check it, which is how `authenticated` can
-- never reach `paid`.
create table public.order_transitions (
  from_status text references public.order_statuses (key),
  to_status text not null references public.order_statuses (key),
  actor text not null check (actor in ('customer', 'system', 'staff')),
  unique (from_status, to_status)
);
-- Nulls are distinct in a unique constraint, so the constraint above would
-- allow two "creation" rows for the same status; this partial index closes it.
create unique index order_transitions_creation_idx
  on public.order_transitions (to_status) where from_status is null;
-- The unique constraint leads with from_status; to_status needs its own index.
create index order_transitions_to_status_idx
  on public.order_transitions (to_status);

-- ── Services, tiers, add-ons, card fees ─────────────────────────────────

create table public.services (
  key text primary key,
  position int not null unique,
  -- Autograph services are offered, priced and accepted only on a card the
  -- customer marks as signed.
  requires_signed boolean not null default false,
  active boolean not null default true
);

create table public.tiers (
  key text primary key,
  service text not null references public.services (key),
  position int not null,
  turnaround_days int not null check (turnaround_days > 0),
  active boolean not null default true
);
create index tiers_service_idx on public.tiers (service);

create table public.tier_prices (
  tier_key text not null references public.tiers (key),
  currency char(3) not null,
  amount_cents bigint not null check (amount_cents >= 0),
  -- Null means no cap on the declared value for this tier.
  max_declared_value_cents bigint check (max_declared_value_cents > 0),
  primary key (tier_key, currency)
);

create table public.add_ons (
  key text primary key,
  position int not null,
  active boolean not null default true
);

create table public.add_on_services (
  add_on_key text not null references public.add_ons (key),
  service text not null references public.services (key),
  primary key (add_on_key, service)
);
-- The primary key leads with add_on_key only; service needs its own index.
create index add_on_services_service_idx on public.add_on_services (service);

create table public.add_on_prices (
  add_on_key text not null references public.add_ons (key),
  currency char(3) not null,
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (add_on_key, currency)
);

create table public.card_fees (
  key text primary key
);

create table public.card_fee_prices (
  fee_key text not null references public.card_fees (key),
  currency char(3) not null,
  amount_cents bigint not null check (amount_cents >= 0),
  primary key (fee_key, currency)
);

-- ── Shipping zones ──────────────────────────────────────────────────────

create table public.shipping_zones (
  key text primary key,
  position int not null
);

create table public.shipping_zone_countries (
  country_code char(2) primary key check (country_code ~ '^[A-Z]{2}$'),
  zone_key text not null references public.shipping_zones (key)
);
create index shipping_zone_countries_zone_key_idx
  on public.shipping_zone_countries (zone_key);

create table public.shipping_zone_prices (
  zone_key text not null references public.shipping_zones (key),
  currency char(3) not null,
  inbound_cents bigint not null check (inbound_cents >= 0),
  return_cents bigint not null check (return_cents >= 0),
  primary key (zone_key, currency)
);

-- ── Row Level Security ──────────────────────────────────────────────────
--
-- Read-only for signed-in users, closed to anon. `revoke all` from
-- authenticated first: Supabase's default privileges hand new public tables
-- every right, and the grant below must be the only one left.

alter table public.order_statuses          enable row level security;
alter table public.order_transitions       enable row level security;
alter table public.services                enable row level security;
alter table public.tiers                   enable row level security;
alter table public.tier_prices             enable row level security;
alter table public.add_ons                 enable row level security;
alter table public.add_on_services         enable row level security;
alter table public.add_on_prices           enable row level security;
alter table public.card_fees               enable row level security;
alter table public.card_fee_prices         enable row level security;
alter table public.shipping_zones          enable row level security;
alter table public.shipping_zone_countries enable row level security;
alter table public.shipping_zone_prices    enable row level security;

revoke all on public.order_statuses, public.order_transitions, public.services,
              public.tiers, public.tier_prices, public.add_ons,
              public.add_on_services, public.add_on_prices, public.card_fees,
              public.card_fee_prices, public.shipping_zones,
              public.shipping_zone_countries, public.shipping_zone_prices
  from anon, authenticated;

grant select on public.order_statuses, public.order_transitions, public.services,
                public.tiers, public.tier_prices, public.add_ons,
                public.add_on_services, public.add_on_prices, public.card_fees,
                public.card_fee_prices, public.shipping_zones,
                public.shipping_zone_countries, public.shipping_zone_prices
  to authenticated;

-- The catalog is visible to every customer by design: they must see prices to
-- choose. One select policy per table, no write policies.
create policy "Signed-in users can read statuses" on public.order_statuses
  for select to authenticated using (true);
create policy "Signed-in users can read transitions" on public.order_transitions
  for select to authenticated using (true);
create policy "Signed-in users can read services" on public.services
  for select to authenticated using (true);
create policy "Signed-in users can read tiers" on public.tiers
  for select to authenticated using (true);
create policy "Signed-in users can read tier prices" on public.tier_prices
  for select to authenticated using (true);
create policy "Signed-in users can read add-ons" on public.add_ons
  for select to authenticated using (true);
create policy "Signed-in users can read add-on services" on public.add_on_services
  for select to authenticated using (true);
create policy "Signed-in users can read add-on prices" on public.add_on_prices
  for select to authenticated using (true);
create policy "Signed-in users can read card fees" on public.card_fees
  for select to authenticated using (true);
create policy "Signed-in users can read card fee prices" on public.card_fee_prices
  for select to authenticated using (true);
create policy "Signed-in users can read shipping zones" on public.shipping_zones
  for select to authenticated using (true);
create policy "Signed-in users can read zone countries" on public.shipping_zone_countries
  for select to authenticated using (true);
create policy "Signed-in users can read zone prices" on public.shipping_zone_prices
  for select to authenticated using (true);

-- ── Reference data ──────────────────────────────────────────────────────

insert into public.order_statuses (key, position) values
  ('draft', 0), ('awaiting_payment', 1), ('paid', 2), ('received', 3),
  ('grading', 4), ('graded', 5), ('shipped_back', 6), ('completed', 7),
  ('cancelled', 8);

-- The M3 transitions. Later modules add their own rows.
insert into public.order_transitions (from_status, to_status, actor) values
  (null,               'draft',            'customer'),
  ('draft',            'awaiting_payment', 'customer'),
  ('draft',            'cancelled',        'customer'),
  ('awaiting_payment', 'cancelled',        'customer'),
  ('awaiting_payment', 'paid',             'system');

-- PLACEHOLDERS. Every price, turnaround and cap below is invented until the
-- client's price list arrives; see docs/content-requests.md. The one real
-- figure is the identification fee (EUR 2.00), which the client named on
-- 2026-10-28. All amounts are EUR cents.
insert into public.services (key, position, requires_signed) values
  ('grading',        0, false),
  ('autograph',      1, true),
  ('dual',           2, true),
  ('authentication', 3, false);

insert into public.tiers (key, service, position, turnaround_days) values
  ('grading_standard',        'grading',        0, 30),
  ('grading_express',         'grading',        1, 10),
  ('autograph_standard',      'autograph',      0, 30),
  ('dual_standard',           'dual',           0, 30),
  ('authentication_standard', 'authentication', 0, 15);

insert into public.tier_prices (tier_key, currency, amount_cents, max_declared_value_cents) values
  ('grading_standard',        'EUR', 100, null),
  ('grading_express',         'EUR', 200, 100000),
  ('autograph_standard',      'EUR', 100, null),
  ('dual_standard',           'EUR', 150, null),
  ('authentication_standard', 'EUR', 100, null);

insert into public.add_ons (key, position) values ('digital_grade', 0);
insert into public.add_on_services (add_on_key, service) values
  ('digital_grade', 'grading'), ('digital_grade', 'dual');
insert into public.add_on_prices (add_on_key, currency, amount_cents) values
  ('digital_grade', 'EUR', 50);

insert into public.card_fees (key) values ('identification');
insert into public.card_fee_prices (fee_key, currency, amount_cents) values
  ('identification', 'EUR', 200);

insert into public.shipping_zones (key, position) values ('placeholder_eu', 0);
insert into public.shipping_zone_countries (country_code, zone_key) values
  ('HU', 'placeholder_eu'), ('AT', 'placeholder_eu'),
  ('DE', 'placeholder_eu'), ('SK', 'placeholder_eu');
insert into public.shipping_zone_prices (zone_key, currency, inbound_cents, return_cents) values
  ('placeholder_eu', 'EUR', 10, 20);
