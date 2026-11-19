-- Certificates link only to counted copies; a forged signature shows no grade;
-- card_total and graded_higher both key off the resolved card.

create or replace function public.pop_certificate(p_cert text)
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
         s.category, s.release_year, s.language, c.service, c.card_grade,
         case when c.autograph_authentication = 'not_genuine' then null else c.autograph_grade end,
         c.card_authentication, c.autograph_authentication, c.published_at, p.total,
         case when c.card_grade is null then null else (
           select count(*)::int
           from public.graded_copies o
           join public.grades og on og.key = o.card_grade
           where o.catalog_card_id = cc.id
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
    -- Only a counted copy gets a public certificate, so it always leads to a card page.
    and (c.card_grade is not null or c.card_authentication = 'genuine'
         or (c.autograph_grade is not null and c.autograph_authentication is distinct from 'not_genuine'))
$$;

