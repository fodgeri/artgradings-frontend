-- Closes the gap between prepare_account_deletion and the deletion itself.
--
-- deleteCurrentUser() prepares the orders, commits, then asks GoTrue to delete
-- the user. Another tab can write orders in between. Those orders would then
-- lose their owner to `on delete set null` with their contact and address data
-- intact, and one submitted in the gap would never expire.
--
-- So the preparation runs again inside the deletion's own transaction. A BEFORE
-- ROW trigger fires with the user row already locked, and an order insert's
-- foreign key check needs a share lock on that row. An insert that committed
-- first is seen here; any later one waits, then fails because the user is gone.
--
-- The call in deleteCurrentUser() stays: it is what turns an unfinished order
-- into a clear message. GoTrue would report this exception as a bare 500. This
-- is the backstop for the gap, and it also holds for a user deleted from the
-- Supabase dashboard.
create or replace function private.guard_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.prepare_account_deletion(old.id) <> 'ok' then
    raise exception 'orders_in_progress' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke execute on function private.guard_account_deletion() from public, anon, authenticated;

create trigger on_auth_user_deleting
before delete on auth.users
for each row execute function private.guard_account_deletion();
