begin;
select plan(15);

select tests.create_user('alice-orders@example.test') as alice_id \gset
select tests.create_user('bob-orders@example.test') as bob_id \gset

-- alice
select tests.authenticate_as(:'alice_id');

select lives_ok($$insert into public.orders default values$$, 'a customer opens a draft');
select is((select user_id from public.orders), :'alice_id'::uuid, 'owned by the caller');
select matches((select reference from public.orders), '^AG-[0-9A-HJKMNP-TV-Z]{8}$',
  'the reference is generated, in the Crockford alphabet');
select throws_ok($$insert into public.orders default values$$, '23505', null, 'one draft per customer');
select throws_ok($$update public.orders set status = 'paid'$$, '42501', null, 'status is not writable');
select throws_ok($$update public.orders set total_cents = 1$$, '42501', null, 'prices are not writable');
select lives_ok($$insert into public.order_cards (order_id, position, name) select id, 0, 'Test card' from public.orders$$,
  'cards go into her own draft');
select is((select identified_by from public.order_cards), 'customer', 'a card defaults to customer-identified');
select throws_ok($$update public.order_cards set identification_cents = 0$$, '42501', null,
  'the identification fee is not writable');
select throws_ok($$update public.order_cards set catalog_ref = 'x'$$, '42501', null,
  'nor the reserved catalogue reference');

select id as alice_order from public.orders \gset
select id as alice_card from public.order_cards \gset
insert into public.card_photos (card_id, content_type, byte_size) values (:'alice_card', 'image/webp', 1000);

-- bob
select tests.authenticate_as(:'bob_id');

select is_empty('select 1 from public.orders', 'another customer sees no orders');
select is_empty('select 1 from public.order_cards', 'nor their cards');
select throws_ok(format($$insert into public.order_cards (order_id, position) values (%L, 1)$$, :'alice_order'),
  '42501', null, 'nor writes into them');

-- as postgres, flip alice's order to awaiting_payment, then as alice
select tests.clear_auth();
update public.orders set status = 'awaiting_payment' where id = :'alice_order';
select tests.authenticate_as(:'alice_id');

select is_empty($$with u as (update public.order_cards set name = 'x' returning 1) select 1 from u$$,
  'a submitted order is immutable to its owner');
select is((select object_key ~ '^card-photos/[0-9a-f-]{36}/[0-9a-f-]{36}$' from public.card_photos limit 1), true,
  'a photo key is derived from its own ids');

select * from finish();
rollback;
