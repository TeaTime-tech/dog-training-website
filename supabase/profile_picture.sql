-- Profile pictures: a small photo per account (picked in Settings > Account and Profile, shown in the top bar).
-- Run AFTER command_mastery.sql (which creates account_settings): SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.

-- the photo itself, shrunk to 256 x 256 in the browser and stored as a data: URL (about 15-40 KB); null for none
alter table public.account_settings add column if not exists avatar text;

alter table public.account_settings drop constraint if exists account_settings_avatar_check;
alter table public.account_settings add constraint account_settings_avatar_check
  check (avatar is null or (avatar like 'data:image/%' and char_length(avatar) <= 300000));
