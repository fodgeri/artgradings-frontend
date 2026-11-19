begin;
select plan(15);

select tests.create_user('copies-pop@example.test') as uid \gset

insert into public.card_sets (id, category, name) values
  ('00000000-0000-0000-0000-0000000000b1', 'pokemon', 'Copies Set');
insert into public.catalog_cards (id, set_id, card_number, name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '4', 'Copy Card');
insert into public.orders (id, user_id) values ('00000000-0000-0000-0000-0000000000e1', :'uid');
insert into public.order_cards (id, order_id, position)
  values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 0);

insert into public.graded_copies (id, cert_number, catalog_card_id, order_card_id, service, card_grade, finalized_at)
values ('00000000-0000-0000-0000-0000000000f1', 'ART-00000001', '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-0000000000e2', 'grading', 'g9', now());

select lives_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service, card_authentication)
  values ('ART-00000002', '00000000-0000-0000-0000-0000000000d1', 'authentication', 'genuine')$$,
  'an authentication-only copy is a result');
select lives_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service, autograph_grade)
  values ('ART-00000003', '00000000-0000-0000-0000-0000000000d1', 'grading', 'g8_5')$$,
  'an autograph-grade-only copy is a result');

select throws_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service)
  values ('ART-00000004', '00000000-0000-0000-0000-0000000000d1', 'grading')$$,
  '23514', null, 'a copy with no result is rejected');
select throws_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service, card_grade, published_at)
  values ('ART-00000005', '00000000-0000-0000-0000-0000000000d1', 'grading', 'g9', now())$$,
  '23514', null, 'publishing needs finalizing');
select throws_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service, card_grade, finalized_at, withdrawn_at)
  values ('ART-00000006', '00000000-0000-0000-0000-0000000000d1', 'grading', 'g9', now(), now())$$,
  '23514', null, 'withdrawing needs publishing');
select throws_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service, card_authentication)
  values ('ART-00000007', '00000000-0000-0000-0000-0000000000d1', 'authentication', 'maybe')$$,
  '23514', null, 'authentication is genuine or not_genuine');
select throws_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service, card_grade)
  values ('art-00000008', '00000000-0000-0000-0000-0000000000d1', 'grading', 'g9')$$,
  '23514', null, 'a lower-case cert is rejected');
select throws_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service, card_grade)
  values ('ART/0009', '00000000-0000-0000-0000-0000000000d1', 'grading', 'g9')$$,
  '23514', null, 'a cert with a slash is rejected');
select throws_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service, card_grade)
  values ('ART-00000001', '00000000-0000-0000-0000-0000000000d1', 'grading', 'g9')$$,
  '23505', null, 'a duplicate cert is rejected');
select throws_ok($$insert into public.graded_copies (cert_number, catalog_card_id, service, card_grade)
  values ('ART-00000010', '00000000-0000-0000-0000-0000000000d1', 'grading', 'g11')$$,
  '23503', null, 'an unknown grade is rejected');

select throws_ok($$delete from public.order_cards where id = '00000000-0000-0000-0000-0000000000e2'$$,
  '23503', null, 'an order card with a graded copy cannot be deleted');

update public.graded_copies set updated_at = '2000-01-01' where id = '00000000-0000-0000-0000-0000000000f1';
update public.graded_copies set card_grade = 'g10' where id = '00000000-0000-0000-0000-0000000000f1';
select cmp_ok((select updated_at from public.graded_copies where id = '00000000-0000-0000-0000-0000000000f1'),
  '>', '2000-01-01'::timestamptz, 'an update moves updated_at');

select ok(exists (select 1 from pg_indexes where indexname = 'graded_copies_public_idx'),
  'the public-copy partial index exists');

select tests.authenticate_as(:'uid');
select throws_ok('select 1 from public.graded_copies', '42501', null, 'signed-in users cannot read copies');
select tests.clear_auth();
select set_config('role', 'anon', true);
select throws_ok('select 1 from public.graded_copies', '42501', null, 'anon reads no copies');

select * from finish();
rollback;
