-- Copies existing accounts' names into account_settings.display_name.
-- Run AFTER command_mastery.sql; safe to run more than once.
-- SQL Editor > New query > paste this file > Run.

alter table public.account_settings add column if not exists display_name text;

-- copy each account's existing name (set on the settings page, else the sign-up username) into the table
insert into public.account_settings (account_id, display_name)
select id, coalesce(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'username')
from auth.users
where coalesce(raw_user_meta_data ->> 'display_name', raw_user_meta_data ->> 'username') is not null
on conflict (account_id) do update
  set display_name = coalesce(public.account_settings.display_name, excluded.display_name);
