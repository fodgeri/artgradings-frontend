-- Names as two columns. Carriers (M6) and invoices (M7) want them separately,
-- and a locale that writes the family name first can format them without
-- parsing one string.
--
-- Dropping full_name is rollback-safe: no application code ever read it —
-- only seed.sql and pgTAP did — so the image running before this migration
-- is unaffected by its absence.
alter table public.profiles
  add column first_name text,
  add column last_name text,
  drop column full_name;

-- Between 1 and 100 CHARACTERS (char_length, not octet_length), matching
-- NAME_MAX_LENGTH in lib/auth/profile-name.ts, which counts code points.
-- The lower bound makes absent always null, never '': "has a name" is then
-- `is not null` everywhere M3 and M6 ask.
alter table public.profiles
  add constraint profiles_first_name_length
    check (char_length(first_name) between 1 and 100),
  add constraint profiles_last_name_length
    check (char_length(last_name) between 1 and 100);
