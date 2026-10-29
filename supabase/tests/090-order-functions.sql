begin;
select plan(35);

select tests.create_user('alice-fn@example.test') as alice_id \gset
select tests.create_user('bob-fn@example.test') as bob_id \gset

-- alice builds a complete postal draft in HU with two cards
select tests.authenticate_as(:'alice_id');

select lives_ok($$insert into public.orders (shipping_method, contact_first_name, contact_last_name,
    contact_phone, address_country, address_postcode, address_city, address_line,
    inbound_insurance_confirmed)
  values ('postal', 'Alice', 'Example', '+36 1 234 5678', 'HU', '1011', 'Budapest', 'Fo utca 1', true)$$,
  'alice opens a complete postal draft');
select id as alice_order from public.orders \gset
select reference as alice_ref from public.orders \gset

insert into public.order_cards (id, order_id, position, identified_by, release_year, brand, language,
  name, set_name, card_number, signed, declared_value_cents, service, tier_key)
values ('00000000-0000-0000-0000-00000000000a', :'alice_order', 0, 'customer', 1999, 'Pokemon', 'en',
  'Charizard', 'Base Set', '4/102', false, 40000, 'grading', 'grading_standard');
insert into public.order_cards (id, order_id, position, identified_by, declared_value_cents, service, tier_key)
values ('00000000-0000-0000-0000-00000000000b', :'alice_order', 1, 'art', 90000,
  'authentication', 'authentication_standard');
insert into public.order_card_add_ons (card_id, add_on_key)
values ('00000000-0000-0000-0000-00000000000a', 'digital_grade');

select is((select count(*)::int from public.order_status_log), 1, 'creation is logged');
select results_eq($$select from_status, to_status, actor from public.order_status_log$$,
  $$values (null::text, 'draft'::text, 'customer'::text)$$, 'as null to draft by the customer');
select matches((select reference from public.orders limit 1), '^AG-[0-9A-HJKMNP-TV-Z]{8}$', 'readable reference');
select is((public.quote_order())->>'total_cents', '480', '100+50 + 100+200 identification + 10 inbound + 20 return');
select is((public.quote_order())->>'turnaround_days', '30', 'the longest tier wins');
select is((public.quote_order())->>'declared_value_total_cents', '130000', 'declared values are summed');
select is((public.quote_order())->>'subtotal_cents', '450', 'subtotal is the cards');

-- a deactivated tier
select tests.clear_auth();
update public.tiers set active = false where key = 'grading_standard';
select tests.authenticate_as(:'alice_id');
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'tier_unavailable', 'a deactivated tier refuses submit');
select tests.clear_auth();
update public.tiers set active = true where key = 'grading_standard';
select tests.authenticate_as(:'alice_id');

-- over the tier cap
insert into public.order_cards (id, order_id, position, identified_by, declared_value_cents, service, tier_key)
values ('00000000-0000-0000-0000-00000000000c', :'alice_order', 2, 'art', 150000, 'grading', 'grading_express');
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'declared_value_over_cap', 'the tier cap holds');
delete from public.order_cards where id = '00000000-0000-0000-0000-00000000000c';

-- dual on an unsigned card
insert into public.order_cards (id, order_id, position, identified_by, declared_value_cents, service, tier_key, signed)
values ('00000000-0000-0000-0000-00000000000c', :'alice_order', 2, 'art', 5000, 'dual', 'dual_standard', false);
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'service_unavailable', 'dual needs a signed card');
delete from public.order_cards where id = '00000000-0000-0000-0000-00000000000c';

-- an add-on from another service
insert into public.order_card_add_ons (card_id, add_on_key)
values ('00000000-0000-0000-0000-00000000000b', 'digital_grade');
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'add_on_unavailable', 'add-ons follow the service');
delete from public.order_card_add_ons where card_id = '00000000-0000-0000-0000-00000000000b';

-- completeness
update public.order_cards set brand = null where id = '00000000-0000-0000-0000-00000000000a';
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'incomplete', 'a customer-identified card needs every field');
update public.order_cards set brand = 'Pokemon' where id = '00000000-0000-0000-0000-00000000000a';

update public.order_cards set release_year = 2100 where id = '00000000-0000-0000-0000-00000000000a';
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'incomplete', 'a release year beyond next year is refused');
update public.order_cards set release_year = 1999 where id = '00000000-0000-0000-0000-00000000000a';

update public.orders set address_country = 'US';
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'country_unsupported', 'only zoned countries');
update public.orders set address_country = 'HU';

update public.orders set inbound_insurance_confirmed = false;
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'incomplete', 'postal needs the acknowledgement');
update public.orders set inbound_insurance_confirmed = true;

-- nothing was written by the refusals
select is((select status from public.orders), 'draft', 'refusals leave the draft a draft');
select is((select total_cents from public.orders), null, 'and write no prices');

-- the profile: first name kept, last name filled
select tests.clear_auth();
update public.profiles set first_name = 'Keep' , last_name = null where id = :'alice_id';
select tests.authenticate_as(:'alice_id');

select matches(public.submit_order('v1'), '^AG-', 'submit returns the reference');
select is((select status from public.orders), 'awaiting_payment', 'submitted');
select results_eq('select price_cents, identification_cents from public.order_cards order by position',
  $$values (150::bigint, 0::bigint), (300::bigint, 200::bigint)$$, 'card prices and the fee stored');
select is((select price_cents from public.order_card_add_ons), 50::bigint, 'add-on price stored');
select isnt((select terms_accepted_at from public.orders), null, 'terms stamped by the server');
select is((select terms_version from public.orders), 'v1', 'terms version stored');
select isnt((select inbound_insurance_confirmed_at from public.orders), null, 'insurance acknowledgement stamped');
select results_eq('select subtotal_cents, inbound_cents, return_cents, total_cents, turnaround_days from public.orders',
  $$values (450::bigint, 10::bigint, 20::bigint, 480::bigint, 30)$$, 'order totals stored');
select throws_ok('select public.submit_order(''v1'')', 'P0001', 'not_draft', 'a second submit is refused, not duplicated');
select is((select count(*)::int from public.order_status_log), 2, 'one log row per transition');
select results_eq($$select first_name, last_name from public.profiles where id = $$ || quote_literal(:'alice_id'),
  $$values ('Keep'::text, 'Example'::text)$$, 'profile names filled when null, kept when set');

-- bob
select tests.authenticate_as(:'bob_id');
select throws_ok(format('select public.cancel_order(%L)', :'alice_ref'), 'P0001', 'not_found',
  'bob cannot cancel alice''s order');
select throws_ok('select public.quote_order()', 'P0001', 'not_found', 'bob has no draft to quote');
-- alice cancels her own order, once
select tests.authenticate_as(:'alice_id');
select lives_ok(format('select public.cancel_order(%L)', :'alice_ref'), 'the owner cancels');
select is((select status from public.orders), 'cancelled', 'cancelled');
select throws_ok(format('select public.cancel_order(%L)', :'alice_ref'), 'P0001', 'transition_not_allowed',
  'a cancelled order cannot be cancelled again');
select tests.authenticate_as(:'bob_id');
select throws_ok('select private.transition_order(null, ''paid'', ''customer'', null)', '42501', null,
  'private functions are not callable by customers');

select * from finish();
rollback;
