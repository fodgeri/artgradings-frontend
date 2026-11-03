-- prepare_account_deletion commits before GoTrue deletes the user, so another
-- tab can write orders in between. Each order below is created AFTER that
-- preparation ran.
begin;
select plan(9);

select tests.create_user('erin-guard@example.test') as erin_id \gset
select tests.create_user('frank-guard@example.test') as frank_id \gset
select tests.create_user('grace-guard@example.test') as grace_id \gset
select tests.create_user('heidi-guard@example.test') as heidi_id \gset

select is(public.prepare_account_deletion(:'erin_id'), 'ok', 'erin is prepared, with nothing to do yet');
select is(public.prepare_account_deletion(:'frank_id'), 'ok', 'frank is prepared');
select is(public.prepare_account_deletion(:'grace_id'), 'ok', 'grace is prepared');
select is(public.prepare_account_deletion(:'heidi_id'), 'ok', 'heidi is prepared');

-- erin: a draft opened in the gap, holding contact data and a photo
insert into public.orders (id, user_id, contact_first_name, address_line)
values ('00000000-0000-0000-0000-0000000001a1', :'erin_id', 'Erin', 'Somewhere 1');
insert into public.order_cards (id, order_id, position, identified_by)
values ('00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-0000000001a1', 0, 'customer');
insert into public.card_photos (id, card_id, content_type, byte_size)
values ('00000000-0000-0000-0000-0000000001a3', '00000000-0000-0000-0000-0000000001a2', 'image/webp', 10);

-- frank: submitted in the gap. Unlike a draft it would never expire.
insert into public.orders (id, user_id, status, contact_first_name, address_line)
values ('00000000-0000-0000-0000-0000000001b1', :'frank_id', 'awaiting_payment', 'Frank', 'Somewhere 2');

-- grace: a finished order that must stay, without its personal fields
insert into public.orders (id, user_id, status, contact_first_name, address_line)
values ('00000000-0000-0000-0000-0000000001c1', :'grace_id', 'completed', 'Grace', 'Somewhere 3');

-- heidi: paid in the gap, so she may not be deleted at all
insert into public.orders (id, user_id, status, contact_first_name, address_line)
values ('00000000-0000-0000-0000-0000000001d1', :'heidi_id', 'paid', 'Heidi', 'Somewhere 4');

delete from auth.users where id in (:'erin_id', :'frank_id', :'grace_id');
select throws_ok(format('delete from auth.users where id = %L', :'heidi_id'), 'P0001', 'orders_in_progress',
  'a paid order still refuses the deletion');

select is((select count(*)::int from public.orders where id = '00000000-0000-0000-0000-0000000001a1'), 0,
  'a draft written after preparation goes with the account');
select is((select count(*)::int from private.photo_deletions
           where object_key like '%00000000-0000-0000-0000-0000000001a3'), 1,
  'and its photo is queued for deletion from R2');
select is((select count(*)::int from public.orders where id = '00000000-0000-0000-0000-0000000001b1'), 0,
  'so does an uncharged order submitted after preparation');
select is((select count(*)::int from public.orders
           where id = '00000000-0000-0000-0000-0000000001c1' and user_id is null
             and contact_first_name is null and address_line is null), 1,
  'a kept order loses its owner and its personal fields');

select * from finish();
rollback;
