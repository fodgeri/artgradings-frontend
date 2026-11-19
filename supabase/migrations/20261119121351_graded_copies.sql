-- Graded copies: one row per physical card that has a result (a grade, an
-- authentication verdict, or an autograph grade). The Pop Report counts these.
--
-- The public-copy rule, used verbatim by every RPC that reads this table:
--   published_at is not null and withdrawn_at is null
--   and card_authentication is distinct from 'not_genuine'
--
-- order_card_id is `on delete restrict` deliberately: a graded copy must never
-- be cascaded away with its order. Public output never carries it.

create table public.graded_copies (
  id uuid primary key default gen_random_uuid(),
  cert_number text not null unique check (cert_number ~ '^[A-Z0-9-]{4,32}$'),
  catalog_card_id uuid not null references public.catalog_cards (id),
  order_card_id uuid references public.order_cards (id) on delete restrict,
  service text not null references public.services (key),
  card_grade text references public.grades (key),
  autograph_grade text references public.grades (key),
  card_authentication text check (card_authentication in ('genuine', 'not_genuine')),
  autograph_authentication text check (autograph_authentication in ('genuine', 'not_genuine')),
  finalized_at timestamptz,
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graded_copies_published_needs_finalized
    check (published_at is null or finalized_at is not null),
  constraint graded_copies_withdrawn_needs_published
    check (withdrawn_at is null or published_at is not null),
  constraint graded_copies_has_a_result
    check (card_grade is not null or card_authentication is not null or autograph_grade is not null)
);

-- Every foreign key column leads an index. The unique cert_number covers itself.
create index graded_copies_catalog_card_id_idx on public.graded_copies (catalog_card_id);
create index graded_copies_order_card_id_idx on public.graded_copies (order_card_id);
create index graded_copies_service_idx on public.graded_copies (service);
create index graded_copies_card_grade_idx on public.graded_copies (card_grade);
create index graded_copies_autograph_grade_idx on public.graded_copies (autograph_grade);
create index graded_copies_updated_at_idx on public.graded_copies (updated_at);

create index graded_copies_public_idx on public.graded_copies (catalog_card_id)
  where published_at is not null and withdrawn_at is null
    and card_authentication is distinct from 'not_genuine';

create trigger graded_copies_touch_updated_at
before update on public.graded_copies
for each row execute function private.touch_updated_at();

alter table public.graded_copies enable row level security;
revoke all on public.graded_copies from anon, authenticated;
