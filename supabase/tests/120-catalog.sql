begin;
select plan(25);

select tests.clear_auth();

select is(public.card_number_key('012/180'), '12', 'leading zeros and the printed total drop');
select is(public.card_number_key('12/180'), '12', 'same card, no zero');
select is(public.card_number_key('12'), '12', 'a bare number');
select is(public.card_number_key('#4'), '4', 'a leading hash drops');
select is(public.card_number_key('000'), '0', 'all zeros keep one');
select is(public.card_number_key('#'), '#', 'a lone hash falls back to itself');
select is(public.card_number_key('/180'), '/180', 'an empty numerator falls back');
select is(public.card_number_key('LOB-EN001'), 'lob-en001', 'prefixed numbers lowercase');
select is(public.card_number_key('TG01/TG30'), 'tg01', 'the total drops, the prefix stays');

insert into public.card_sets (id, category, name) values
  ('00000000-0000-0000-0000-0000000000a1', 'pokemon', 'Test Set');

insert into public.catalog_cards (id, set_id, card_number, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', '012/180', 'Test Card');

select throws_ok($$insert into public.catalog_cards (set_id, card_number, name)
  values ('00000000-0000-0000-0000-0000000000a1', '12/180', 'Dup')$$,
  '23505', null, 'the same number in another spelling is a duplicate');

select lives_ok($$insert into public.catalog_cards (set_id, card_number, name, variant)
  values ('00000000-0000-0000-0000-0000000000a1', '12/180', 'Dup', '1st Edition')$$,
  'a variant of the same number is allowed');

select lives_ok($$insert into public.catalog_cards (set_id, card_number, name, merged_into)
  values ('00000000-0000-0000-0000-0000000000a1', '12', 'Merged', '00000000-0000-0000-0000-0000000000c1')$$,
  'a merged row may share keys with its survivor');

select throws_ok($$insert into public.catalog_cards (set_id, card_number, name, external_source)
  values ('00000000-0000-0000-0000-0000000000a1', '99', 'X', 'tcgdex')$$,
  '23514', null, 'an external source needs an external id');

insert into public.catalog_cards (set_id, card_number, name, external_source, external_id)
  values ('00000000-0000-0000-0000-0000000000a1', '50', 'Ext', 'tcgdex', 'abc');

select throws_ok($$insert into public.catalog_cards (set_id, card_number, name, external_source, external_id)
  values ('00000000-0000-0000-0000-0000000000a1', '51', 'Ext2', 'tcgdex', 'abc')$$,
  '23505', null, 'an external reference is unique');

select throws_ok($$insert into public.catalog_categories (key, kind, position) values ('sets', 'tcg', 99)$$,
  '23514', null, 'a category key cannot shadow a route segment');

select results_eq('select array_agg(key order by position) from public.grades',
  $$select array['g1','g1_5','g2','g2_5','g3','g3_5','g4','g4_5','g5','g5_5','g6','g6_5','g7','g7_5','g8','g8_5','g9','g9_5','g10']$$,
  'the nineteen grades in order');

select results_eq('select array_agg(key order by position) from public.catalog_categories',
  $$select array['pokemon','mtg','yugioh','one_piece','basketball','soccer','baseball','american_football','hockey']$$,
  'the seeded categories in order');

update public.catalog_cards set updated_at = '2000-01-01' where id = '00000000-0000-0000-0000-0000000000c1';
update public.catalog_cards set name = 'Renamed' where id = '00000000-0000-0000-0000-0000000000c1';
select cmp_ok((select updated_at from public.catalog_cards where id = '00000000-0000-0000-0000-0000000000c1'),
  '>', '2000-01-01'::timestamptz, 'an update moves updated_at');

update public.card_sets set updated_at = '2000-01-01';
update public.card_sets set name = 'Renamed';
select cmp_ok((select min(updated_at) from public.card_sets), '>', '2000-01-01'::timestamptz,
  'set updates move updated_at too');

select tests.create_user('catalog-pop@example.test') as uid \gset
select tests.authenticate_as(:'uid');
select throws_ok('select 1 from public.catalog_categories', '42501', null, 'signed-in users cannot read categories');
select throws_ok('select 1 from public.card_sets', '42501', null, 'nor sets');
select throws_ok('select 1 from public.catalog_cards', '42501', null, 'nor cards');

select tests.clear_auth();
select set_config('role', 'anon', true);
select throws_ok('select 1 from public.catalog_cards', '42501', null, 'anon reads no cards');
select throws_ok('select 1 from public.grades', '42501', null, 'anon reads no grades');
select throws_ok('select 1 from public.card_set_external_refs', '42501', null, 'anon reads no refs');

select * from finish();
rollback;
