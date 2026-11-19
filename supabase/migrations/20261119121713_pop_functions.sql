-- Public Pop Report reads. Catalogue and graded-copy tables have no anon or
-- authenticated access, so these security-definer functions are the only door.
--
-- The public-copy rule (graded_copies migration), used verbatim below:
--   published_at is not null and withdrawn_at is null
--   and card_authentication is distinct from 'not_genuine'
-- Output never carries order_card_id, an order, a user or a price.

-- One card's population: the single definition every public function shares.
-- Not granted to anyone; callers are security definer.
create function private.card_population(p_card uuid)
returns table (grade_counts jsonb, authentic_count int, total int, autograph_counts jsonb, autograph_total int)
language sql
stable
security definer
set search_path = ''
as $$
  with pub as (
    select c.card_grade, c.autograph_grade, c.card_authentication, c.autograph_authentication
    from public.graded_copies c
    where c.catalog_card_id = p_card
      and c.published_at is not null and c.withdrawn_at is null
      and c.card_authentication is distinct from 'not_genuine'
  ),
  g as (
    select card_grade as k, count(*)::int as n from pub where card_grade is not null group by card_grade
  ),
  a as (
    select autograph_grade as k, count(*)::int as n from pub
    where autograph_grade is not null and autograph_authentication is distinct from 'not_genuine'
    group by autograph_grade
  ),
  x as (
    select
      coalesce((select jsonb_object_agg(k, n) from g), '{}'::jsonb) as grade_counts,
      (select count(*)::int from pub where card_grade is null and card_authentication = 'genuine') as authentic_count,
      coalesce((select jsonb_object_agg(k, n) from a), '{}'::jsonb) as autograph_counts,
      coalesce((select sum(n) from a), 0)::int as autograph_total,
      coalesce((select sum(n) from g), 0)::int as graded_total
  )
  select x.grade_counts, x.authentic_count, x.graded_total + x.authentic_count,
         x.autograph_counts, x.autograph_total
  from x
$$;

revoke all on function private.card_population(uuid) from public;

-- A catalogue card is public when it is a live row with at least one counted copy.
create function private.is_public_card(p_card uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_cards cc
    cross join lateral private.card_population(cc.id) p
    where cc.id = p_card and cc.merged_into is null and p.total + p.autograph_total > 0
  )
$$;

revoke all on function private.is_public_card(uuid) from public;

create function public.pop_grades()
returns table (key text, value numeric)
language sql stable security definer set search_path = ''
as $$ select g.key, g.value from public.grades g order by g.position $$;

create function public.pop_categories()
returns table (key text, kind text, set_count int, total int)
language sql stable security definer set search_path = ''
as $$
  select cat.key, cat.kind, count(distinct cc.set_id)::int, sum(p.total)::int
  from public.catalog_categories cat
  join public.card_sets s on s.category = cat.key
  join public.catalog_cards cc on cc.set_id = s.id and cc.merged_into is null
  cross join lateral private.card_population(cc.id) p
  where cat.active and p.total + p.autograph_total > 0
  group by cat.key, cat.kind, cat.position
  order by cat.position
$$;

create function public.pop_category_sets(p_category text)
returns table (id uuid, name text, code text, language text, release_year int, series text, card_count int, total int)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.code, s.language, s.release_year, s.series,
         count(*)::int, sum(p.total)::int
  from public.card_sets s
  join public.catalog_cards cc on cc.set_id = s.id and cc.merged_into is null
  cross join lateral private.card_population(cc.id) p
  where s.category = p_category and p.total + p.autograph_total > 0
  group by s.id
  order by s.series nulls last, s.release_year desc nulls last, s.name
$$;

create function public.pop_set(p_set uuid)
returns table (id uuid, category text, kind text, name text, code text, language text,
               release_year int, series text, total_cards int)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.category, cat.kind, s.name, s.code, s.language, s.release_year, s.series, s.total_cards
  from public.card_sets s
  join public.catalog_categories cat on cat.key = s.category
  where s.id = p_set
    and exists (
      select 1 from public.catalog_cards cc
      where cc.set_id = s.id and private.is_public_card(cc.id))
$$;

create function public.pop_set_cards(p_set uuid)
returns table (id uuid, card_number text, name text, variant text, grade_counts jsonb,
               authentic_count int, total int, autograph_counts jsonb, autograph_total int)
language sql stable security definer set search_path = ''
as $$
  select cc.id, cc.card_number, cc.name, cc.variant, p.grade_counts, p.authentic_count,
         p.total, p.autograph_counts, p.autograph_total
  from public.catalog_cards cc
  cross join lateral private.card_population(cc.id) p
  where cc.set_id = p_set and cc.merged_into is null and p.total + p.autograph_total > 0
  order by (cc.number_key ~ '^[0-9]+$') desc,
           case when cc.number_key ~ '^[0-9]+$' then lpad(cc.number_key, 12, '0') else cc.number_key end,
           cc.variant nulls first, cc.name
$$;

create function public.pop_card(p_card uuid)
returns table (id uuid, set_id uuid, set_name text, set_code text, category text, kind text,
               card_number text, name text, variant text, rarity text, language text,
               release_year int, series text, grade_counts jsonb, authentic_count int,
               total int, autograph_counts jsonb, autograph_total int)
language sql stable security definer set search_path = ''
as $$
  select cc.id, s.id, s.name, s.code, s.category, cat.kind, cc.card_number, cc.name,
         cc.variant, cc.rarity, s.language, s.release_year, s.series,
         p.grade_counts, p.authentic_count, p.total, p.autograph_counts, p.autograph_total
  from public.catalog_cards cc
  join public.card_sets s on s.id = cc.set_id
  join public.catalog_categories cat on cat.key = s.category
  cross join lateral private.card_population(cc.id) p
  where cc.id = p_card and cc.merged_into is null and p.total + p.autograph_total > 0
$$;

create function public.pop_resolve_card(p_card uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  with recursive chain as (
    select cc.id, cc.merged_into, 0 as hops
    from public.catalog_cards cc where cc.id = p_card
    union all
    select n.id, n.merged_into, c.hops + 1
    from chain c
    join public.catalog_cards n on n.id = c.merged_into
    where c.hops < 10
  )
  select id from chain where merged_into is null order by hops desc limit 1
$$;

create function public.pop_certificate(p_cert text)
returns table (status text, cert_number text, card_id uuid, card_name text, card_number text,
               variant text, set_id uuid, set_name text, category text, release_year int,
               language text, service text, card_grade text, autograph_grade text,
               card_authentication text, autograph_authentication text,
               published_at timestamptz, card_total int, graded_higher int)
language sql stable security definer set search_path = ''
as $$
  -- A published copy later withdrawn answers 'withdrawn' whatever its verdicts.
  select 'withdrawn'::text, c.cert_number, null::uuid, null::text, null::text, null::text,
         null::uuid, null::text, null::text, null::int, null::text, null::text, null::text,
         null::text, null::text, null::text, null::timestamptz, null::int, null::int
  from public.graded_copies c
  where c.cert_number = p_cert and c.published_at is not null and c.withdrawn_at is not null
  union all
  select 'public', c.cert_number, cc.id, cc.name, cc.card_number, cc.variant, s.id, s.name,
         s.category, s.release_year, s.language, c.service, c.card_grade, c.autograph_grade,
         c.card_authentication, c.autograph_authentication, c.published_at, p.total,
         case when c.card_grade is null then null else (
           select count(*)::int
           from public.graded_copies o
           join public.grades og on og.key = o.card_grade
           where o.catalog_card_id = c.catalog_card_id
             and o.published_at is not null and o.withdrawn_at is null
             and o.card_authentication is distinct from 'not_genuine'
             and og.value > (select g.value from public.grades g where g.key = c.card_grade)
         ) end
  from public.graded_copies c
  cross join lateral (select public.pop_resolve_card(c.catalog_card_id) as rid) r
  join public.catalog_cards cc on cc.id = r.rid
  join public.card_sets s on s.id = cc.set_id
  cross join lateral private.card_population(cc.id) p
  where c.cert_number = p_cert
    and c.published_at is not null and c.withdrawn_at is null
    and c.card_authentication is distinct from 'not_genuine'
$$;

create function public.pop_recent_copies(p_limit int)
returns table (cert_number text, card_id uuid, card_name text, card_number text, variant text,
               rarity text, set_name text, category text, release_year int, card_grade text,
               published_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.cert_number, cc.id, cc.name, cc.card_number, cc.variant, cc.rarity, s.name,
         s.category, s.release_year, c.card_grade, c.published_at
  from public.graded_copies c
  cross join lateral (select public.pop_resolve_card(c.catalog_card_id) as rid) r
  join public.catalog_cards cc on cc.id = r.rid
  join public.card_sets s on s.id = cc.set_id
  where c.card_grade is not null
    and c.published_at is not null and c.withdrawn_at is null
    and c.card_authentication is distinct from 'not_genuine'
  order by c.published_at desc, c.cert_number
  limit greatest(least(p_limit, 24), 0)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'pop_grades()', 'pop_categories()', 'pop_category_sets(text)', 'pop_set(uuid)',
    'pop_set_cards(uuid)', 'pop_card(uuid)', 'pop_resolve_card(uuid)',
    'pop_certificate(text)', 'pop_recent_copies(int)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
end $$;
