begin;
select plan(9);

select tests.clear_auth();

select results_eq(
  'select key from public.order_statuses order by position',
  $$values ('draft'),('awaiting_payment'),('paid'),('received'),('grading'),
           ('graded'),('shipped_back'),('completed'),('cancelled')$$,
  'the nine statuses, in journey order');

select results_eq(
  $$select coalesce(from_status,'∅'), to_status, actor from public.order_transitions order by 1,2$$,
  -- The database collation sorts the '∅' placeholder before letters.
  $$values ('∅','draft','customer'),
           ('awaiting_payment','cancelled','customer'),('awaiting_payment','paid','system'),
           ('draft','awaiting_payment','customer'),('draft','cancelled','customer')$$,
  'exactly the M3 transitions');

select tests.create_user('catalog@example.test') as uid \gset
select tests.authenticate_as(:'uid');

select isnt_empty('select 1 from public.tiers', 'signed-in users read tiers');

select results_eq('select key from public.services where requires_signed order by position',
  $$values ('autograph'),('dual')$$, 'autograph services need a signed card');

select throws_ok($$insert into public.tiers (key, service, position, turnaround_days) values ('x','grading',9,1)$$,
  '42501', null, 'nobody writes the catalog through the Data API');

select throws_ok($$update public.card_fee_prices set amount_cents = 0$$, '42501', null, 'nor its prices');

select results_eq($$select service from public.add_on_services where add_on_key = 'digital_grade' order by 1$$,
  $$values ('dual'),('grading')$$, 'digital grade applies to graded services only');

select is((select amount_cents from public.card_fee_prices where fee_key = 'identification' and currency = 'EUR'),
  200::bigint, 'the identification fee is seeded');

select tests.clear_auth();
select set_config('role', 'anon', true);
select throws_ok('select 1 from public.tiers', '42501', null, 'anon reads nothing');

select * from finish();
rollback;
