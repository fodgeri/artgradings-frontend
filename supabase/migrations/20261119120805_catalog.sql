-- M4 Pop Report: the card catalogue, the grade scale and the card-number key.
-- Public reads are security-definer RPCs added later, so these tables carry
-- RLS with no policies and no grants for the Data API roles.

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Cardstrade's rule: '012/180', '12/180', '#12' and '12' are one card number.
-- Pure, so everyone may execute it.
create or replace function public.card_number_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    nullif(
      regexp_replace(
        split_part(lower(btrim(regexp_replace(btrim(p), '^#+', ''))), '/', 1),
        '^0+([0-9])', '\1'),
      ''),
    lower(btrim(p)))
$$;

grant execute on function public.card_number_key(text) to anon, authenticated, service_role;

create table public.catalog_categories (
  key text primary key
    check (key ~ '^[a-z][a-z0-9_]{1,30}$' and key not in ('sets', 'cards')),
  kind text not null check (kind in ('tcg', 'sports')),
  position int not null unique,
  active boolean not null default true
);

create table public.card_sets (
  id uuid primary key default gen_random_uuid(),
  category text not null references public.catalog_categories (key),
  name text not null check (char_length(name) <= 200),
  code text check (char_length(code) <= 30),
  language text not null default 'en' check (language ~ '^[a-z]{2}$'),
  release_year int check (release_year between 1880 and 2100),
  series text check (char_length(series) <= 100),
  total_cards int check (total_cards > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index card_sets_category_idx on public.card_sets (category);

create table public.card_set_external_refs (
  set_id uuid not null references public.card_sets (id) on delete cascade,
  source text not null check (source ~ '^[a-z0-9_]{2,30}$'),
  external_id text not null check (char_length(external_id) <= 100),
  language text check (language ~ '^[a-z]{2}$'),
  created_at timestamptz not null default now(),
  primary key (source, external_id)
);
create index card_set_external_refs_set_idx on public.card_set_external_refs (set_id);

create table public.catalog_cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.card_sets (id),
  card_number text not null check (char_length(card_number) <= 50),
  number_key text generated always as (public.card_number_key(card_number)) stored,
  name text not null check (char_length(name) <= 200),
  variant text check (char_length(variant) <= 100),
  rarity text check (char_length(rarity) <= 100),
  external_source text,
  external_id text,
  merged_into uuid references public.catalog_cards (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (merged_into <> id),
  check ((external_source is null) = (external_id is null))
);
create unique index catalog_cards_identity_key
  on public.catalog_cards (set_id, number_key, coalesce(variant, ''))
  where merged_into is null;
create unique index catalog_cards_external_key
  on public.catalog_cards (external_source, external_id)
  where external_id is not null;
create index catalog_cards_merged_into_idx on public.catalog_cards (merged_into);

create table public.grades (
  key text primary key check (key ~ '^g[0-9]+(_5)?$'),
  value numeric(3, 1) not null unique,
  position int not null unique
);

create trigger card_sets_touch_updated_at
before update on public.card_sets
for each row execute function private.touch_updated_at();

create trigger catalog_cards_touch_updated_at
before update on public.catalog_cards
for each row execute function private.touch_updated_at();

alter table public.catalog_categories enable row level security;
alter table public.card_sets enable row level security;
alter table public.card_set_external_refs enable row level security;
alter table public.catalog_cards enable row level security;
alter table public.grades enable row level security;

revoke all on public.catalog_categories from anon, authenticated;
revoke all on public.card_sets from anon, authenticated;
revoke all on public.card_set_external_refs from anon, authenticated;
revoke all on public.catalog_cards from anon, authenticated;
revoke all on public.grades from anon, authenticated;

-- Placeholder scale and categories until the client confirms them.
insert into public.grades (key, value, position)
select 'g' || (n / 2) || case when n % 2 = 1 then '_5' else '' end,
       (n / 2.0)::numeric(3, 1),
       n - 1
from generate_series(2, 20) as n;

insert into public.catalog_categories (key, kind, position) values
  ('pokemon', 'tcg', 1), ('mtg', 'tcg', 2), ('yugioh', 'tcg', 3), ('one_piece', 'tcg', 4),
  ('basketball', 'sports', 5), ('soccer', 'sports', 6), ('baseball', 'sports', 7),
  ('american_football', 'sports', 8), ('hockey', 'sports', 9);
