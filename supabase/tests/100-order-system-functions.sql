begin;
select plan(20);

select tests.create_user('alice-sys@example.test') as alice_id \gset
select tests.create_user('bob-sys@example.test') as bob_id \gset
select tests.create_user('carol-sys@example.test') as carol_id \gset
select tests.create_user('dave-sys@example.test') as dave_id \gset

-- alice submits an order worth 480, built like 090-order-functions.sql
select tests.authenticate_as(:'alice_id');
insert into public.orders (shipping_method, contact_first_name, contact_last_name,
  contact_phone, address_country, address_postcode, address_city, address_line,
  inbound_insurance_confirmed)
values ('postal', 'Alice', 'Example', '+36 1 234 5678', 'HU', '1011', 'Budapest', 'Fo utca 1', true);
select id as alice_order from public.orders \gset
insert into public.order_cards (id, order_id, position, identified_by, release_year, brand, language,
  name, set_name, card_number, signed, declared_value_cents, service, tier_key)
values ('00000000-0000-0000-0000-00000000000a', :'alice_order', 0, 'customer', 1999, 'Pokemon', 'en',
  'Charizard', 'Base Set', '4/102', false, 40000, 'grading', 'grading_standard');
insert into public.order_cards (id, order_id, position, identified_by, declared_value_cents, service, tier_key)
values ('00000000-0000-0000-0000-00000000000b', :'alice_order', 1, 'art', 90000,
  'authentication', 'authentication_standard');
insert into public.order_card_add_ons (card_id, add_on_key)
values ('00000000-0000-0000-0000-00000000000a', 'digital_grade');
select public.submit_order('v1') as alice_ref \gset

select throws_ok(format('select public.record_payment_success(%L, ''fake'', ''fake_x'', 480, ''EUR'')', :'alice_order'),
  '42501', null, 'a customer cannot mark an order paid');
select throws_ok('select public.expire_stale_drafts()', '42501', null, 'nor run the expiry');

-- the system
select set_config('role', 'service_role', true);
select is(public.record_payment_success(:'alice_order', 'fake', 'fake_0', 999, 'EUR'), 'rejected', 'wrong amount is rejected');
select is((select outcome || amount_cents from public.payment_attempts where provider_reference = 'fake_0'), 'succeeded999',
  'but the money that moved is recorded');
select is((select status from public.orders where id = :'alice_order'), 'awaiting_payment', 'and the order stays unpaid');
-- a failure recorded first must not shadow the success under the same reference
select public.record_payment_failure(:'alice_order', 'fake', 'fake_1', 480, 'EUR');
select is(public.record_payment_success(:'alice_order', 'fake', 'fake_1', 480, 'EUR'), 'recorded', 'paid');
select is((select count(*)::int from public.payment_attempts where provider_reference = 'fake_1' and outcome = 'succeeded'), 1,
  'the failed attempt was upgraded, not duplicated');
select is(public.record_payment_success(:'alice_order', 'fake', 'fake_1', 480, 'EUR'), 'duplicate', 'idempotent by reference');
select is(public.record_payment_success(:'alice_order', 'fake', 'fake_2', 480, 'EUR'), 'rejected', 'a paid order takes no second payment');
select is((select count(*)::int from public.payment_attempts where provider_reference = 'fake_2'), 1, 'but the charge is recorded');
select is((select count(*)::int from public.order_status_log where to_status = 'paid'), 1, 'one paid transition');

-- carol's draft, stale for 31 days, with one photo
-- (service_role cannot reach the tests schema, so step out with reset role)
reset role;
insert into public.orders (id, user_id) values ('00000000-0000-0000-0000-0000000000c1', :'carol_id');
insert into public.order_cards (id, order_id, position) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 0);
insert into public.card_photos (id, card_id, content_type, byte_size)
values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c2', 'image/webp', 10);
-- backdate last: the child inserts touch the order, and the trigger would reset it
set local session_replication_role = replica;
update public.orders set updated_at = now() - interval '31 days' where id = '00000000-0000-0000-0000-0000000000c1';
set local session_replication_role = origin;
select set_config('role', 'service_role', true);
select is(public.expire_stale_drafts(), 1, 'the stale draft expires');
select is((select count(*)::int from public.list_photo_deletions(10)), 1, 'its photo is queued for R2');

-- a key whose row exists again (same id re-inserted) is never offered for deletion
reset role;
insert into public.orders (id, user_id) values ('00000000-0000-0000-0000-0000000000c1', :'carol_id');
insert into public.order_cards (id, order_id, position) values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 0);
insert into public.card_photos (id, card_id, content_type, byte_size)
values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c2', 'image/webp', 10);
select set_config('role', 'service_role', true);
select is((select count(*)::int from public.list_photo_deletions(10)), 0, 'a key that is live again is not offered for deletion');

-- alice has a paid order
reset role;
select tests.authenticate_as(:'alice_id');
select is(public.prepare_account_deletion(), 'orders_in_progress', 'deletion waits for paid orders');

-- bob has a draft
select tests.clear_auth();
insert into public.orders (user_id, contact_first_name, address_line) values (:'bob_id', 'Bob', 'Somewhere 1');
select tests.authenticate_as(:'bob_id');
select is(public.prepare_account_deletion(), 'ok', 'drafts are no obstacle and are removed');
select tests.clear_auth();
select is((select count(*)::int from public.orders where user_id = :'bob_id'), 0, 'bob''s draft is gone');

-- dave: scrub of kept orders, deletion of the rest
reset role;
insert into public.orders (id, user_id, status, contact_first_name, contact_last_name, contact_phone,
  address_country, address_postcode, address_city, address_line)
values
  ('00000000-0000-0000-0000-0000000000e1', :'dave_id', 'completed', 'Dave', 'Example', '+36 1 234 5678', 'HU', '1011', 'Budapest', 'Fo utca 1'),
  ('00000000-0000-0000-0000-0000000000e2', :'dave_id', 'cancelled', 'Dave', 'Example', '+36 1 234 5678', 'HU', '1011', 'Budapest', 'Fo utca 1'),
  ('00000000-0000-0000-0000-0000000000e3', :'dave_id', 'cancelled', 'Dave', 'Example', '+36 1 234 5678', 'HU', '1011', 'Budapest', 'Fo utca 1');
insert into public.payment_attempts (order_id, provider, provider_reference, outcome, amount_cents, currency)
values ('00000000-0000-0000-0000-0000000000e2', 'fake', 'fake_e2', 'succeeded', 100, 'EUR');
select tests.authenticate_as(:'dave_id');
select is(public.prepare_account_deletion(), 'ok', 'finished orders are no obstacle');
select tests.clear_auth();
select results_eq($$select id::text from public.orders where user_id = $$ || quote_literal(:'dave_id') || $$ order by id$$,
  $$values ('00000000-0000-0000-0000-0000000000e1'::text), ('00000000-0000-0000-0000-0000000000e2'::text)$$,
  'the completed and the charged-then-cancelled orders are kept, the uncharged cancelled one is deleted');
select is((select count(*)::int from public.orders where user_id = :'dave_id'
  and contact_first_name is null and contact_last_name is null and contact_phone is null
  and address_country is null and address_postcode is null and address_city is null and address_line is null), 2,
  'and both are scrubbed of contact and address');

select * from finish();
rollback;
