begin;
select plan(25);

insert into public.card_sets (id, category, name, code, language, release_year, series, total_cards) values
  ('00000000-0000-0000-0000-0000000001b1', 'pokemon', 'Pop Set', 'PS', 'en', 2020, 'Pop Series', 102),
  ('00000000-0000-0000-0000-0000000001b2', 'pokemon', 'Empty Set', null, 'en', 2021, null, null);

insert into public.catalog_cards (id, set_id, card_number, name, variant, rarity) values
  ('00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-0000000001b1', '2', 'Card A', null, 'Rare'),
  ('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-0000000001b1', '10', 'Card B', null, null),
  ('00000000-0000-0000-0000-0000000001a3', '00000000-0000-0000-0000-0000000001b1', '004/102', 'Card C', null, null),
  ('00000000-0000-0000-0000-0000000001a4', '00000000-0000-0000-0000-0000000001b1', 'TG01', 'Card D', null, null),
  ('00000000-0000-0000-0000-0000000001a5', '00000000-0000-0000-0000-0000000001b1', '2', 'Card E', 'Holo', null),
  ('00000000-0000-0000-0000-0000000001a7', '00000000-0000-0000-0000-0000000001b2', '1', 'Card G', null, null);
insert into public.catalog_cards (id, set_id, card_number, name, merged_into) values
  ('00000000-0000-0000-0000-0000000001a6', '00000000-0000-0000-0000-0000000001b1', '2', 'Card F', '00000000-0000-0000-0000-0000000001a1');

-- Copies of A
insert into public.graded_copies
  (id, cert_number, catalog_card_id, service, card_grade, autograph_grade, card_authentication, autograph_authentication, finalized_at, published_at, withdrawn_at) values
  ('00000000-0000-0000-0000-0000000002a1', 'ART-P0000001', '00000000-0000-0000-0000-0000000001a1', 'grading', 'g10', null, null, null, now(), now() - interval '1 hour', null),
  ('00000000-0000-0000-0000-0000000002a2', 'ART-P0000002', '00000000-0000-0000-0000-0000000001a1', 'grading', 'g10', null, null, null, now(), now() - interval '2 hour', null),
  ('00000000-0000-0000-0000-0000000002a3', 'ART-P0000003', '00000000-0000-0000-0000-0000000001a1', 'grading', 'g9', null, null, null, now(), now() - interval '3 hour', null),
  ('00000000-0000-0000-0000-0000000002a4', 'ART-P0000004', '00000000-0000-0000-0000-0000000001a1', 'authentication', null, null, 'genuine', null, now(), now(), null),
  ('00000000-0000-0000-0000-0000000002a5', 'ART-P0000005', '00000000-0000-0000-0000-0000000001a1', 'autograph', null, 'g8', null, 'genuine', now(), now(), null),
  ('00000000-0000-0000-0000-0000000002a6', 'ART-P0000006', '00000000-0000-0000-0000-0000000001a1', 'grading', 'g10', null, null, null, now(), null, null),
  ('00000000-0000-0000-0000-0000000002a7', 'ART-P0000007', '00000000-0000-0000-0000-0000000001a1', 'grading', 'g10', null, null, null, now(), now(), now()),
  ('00000000-0000-0000-0000-0000000002a8', 'ART-P0000008', '00000000-0000-0000-0000-0000000001a1', 'authentication', null, null, 'not_genuine', null, now(), now(), null),
  ('00000000-0000-0000-0000-0000000002b1', 'ART-P0000009', '00000000-0000-0000-0000-0000000001a2', 'dual', 'g7', 'g9', null, 'not_genuine', now(), now(), null),
  ('00000000-0000-0000-0000-0000000002c1', 'ART-P0000010', '00000000-0000-0000-0000-0000000001a3', 'grading', 'g6', null, null, null, now(), now(), null),
  ('00000000-0000-0000-0000-0000000002d1', 'ART-P0000011', '00000000-0000-0000-0000-0000000001a4', 'grading', 'g5', null, null, null, now(), now(), null),
  ('00000000-0000-0000-0000-0000000002e1', 'ART-P0000012', '00000000-0000-0000-0000-0000000001a5', 'grading', 'g4', null, null, null, now(), now(), null);

select set_config('role', 'anon', true);

select is((select to_jsonb(p) - 'id' - 'set_id' - 'set_name' - 'set_code' - 'category' - 'kind' - 'card_number' - 'name' - 'variant' - 'rarity' - 'language' - 'release_year' - 'series'
  from public.pop_card('00000000-0000-0000-0000-0000000001a1') p),
  '{"grade_counts":{"g10":2,"g9":1},"authentic_count":1,"total":4,"autograph_counts":{"g8":1},"autograph_total":1}'::jsonb,
  'pop_card(A) counts only public copies');
select is((select total from public.pop_card('00000000-0000-0000-0000-0000000001a2')), 1, 'B total');
select is((select autograph_total from public.pop_card('00000000-0000-0000-0000-0000000001a2')), 0, 'a not_genuine autograph is not counted');
select is((select count(*)::int from public.pop_card('00000000-0000-0000-0000-0000000001a6')), 0, 'a merged card has no page');
select is(public.pop_resolve_card('00000000-0000-0000-0000-0000000001a6'), '00000000-0000-0000-0000-0000000001a1'::uuid, 'merge resolves');
select is(public.pop_resolve_card('00000000-0000-0000-0000-0000000001a1'), '00000000-0000-0000-0000-0000000001a1'::uuid, 'a live card resolves to itself');
select is(public.pop_resolve_card(gen_random_uuid()), null, 'unknown resolves to null');
select is((select count(*)::int from public.pop_card('00000000-0000-0000-0000-0000000001a7')), 0, 'a card with no public copy has no page');

select is((select array_agg(id order by ord) from (select id, row_number() over () as ord from public.pop_set_cards('00000000-0000-0000-0000-0000000001b1')) s),
  array['00000000-0000-0000-0000-0000000001a1','00000000-0000-0000-0000-0000000001a5','00000000-0000-0000-0000-0000000001a3','00000000-0000-0000-0000-0000000001a2','00000000-0000-0000-0000-0000000001a4']::uuid[],
  'set cards sort 2, 2 Holo, 004/102, 10, TG01');

select is((select count(*)::int from public.pop_set('00000000-0000-0000-0000-0000000001b1')), 1, 'a set with public cards has a page');
select is((select count(*)::int from public.pop_set('00000000-0000-0000-0000-0000000001b2')), 0, 'an empty set has no page');
select is((select array_agg(id) from public.pop_category_sets('pokemon') where id in ('00000000-0000-0000-0000-0000000001b1','00000000-0000-0000-0000-0000000001b2')),
  array['00000000-0000-0000-0000-0000000001b1']::uuid[], 'category lists only sets with public cards');
select is((select card_count from public.pop_category_sets('pokemon') where id = '00000000-0000-0000-0000-0000000001b1'), 5, 'set card count');
select is((select array_agg(key) from public.pop_categories() where key in ('pokemon','mtg')), array['pokemon'], 'categories list only those with public cards');
select ok((select count(*) from public.pop_grades()) >= 10, 'grades are listed');

select is((select status from public.pop_certificate('ART-P0000003')), 'public', 'public cert');
select is((select graded_higher from public.pop_certificate('ART-P0000003')), 2, 'graded higher');
select is((select card_total from public.pop_certificate('ART-P0000003')), 4, 'card total');
select is((select status || coalesce(card_id::text, 'null') from public.pop_certificate('ART-P0000007')), 'withdrawnnull', 'withdrawn cert exposes no card');
select is((select count(*)::int from public.pop_certificate('ART-P0000006')), 0, 'unpublished cert: no row');
select is((select count(*)::int from public.pop_certificate('ART-P0000008')), 0, 'not_genuine cert: no row');
select is((select count(*)::int from public.pop_certificate('ART-NOPE0000')), 0, 'unknown cert: no row');

select ok((select count(*) from public.pop_recent_copies(100)) <= 24
  and not exists (select 1 from public.pop_recent_copies(100) where cert_number in ('ART-P0000004', 'ART-P0000005')),
  'recent copies are capped and card-graded only');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'pop\_%' and 'order_card_id' = any (p.proargnames)), 0,
  'no pop function exposes order_card_id');
select throws_ok('select 1 from public.graded_copies', '42501', null, 'anon still cannot read copies');

select * from finish();
rollback;
