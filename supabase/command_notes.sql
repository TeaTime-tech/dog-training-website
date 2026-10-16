-- Per-command notes written on the Commands page.
-- Run AFTER command_mastery.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.

-- { "sit": "Hand signal: flat palm up...", ... } keyed by lowercase command name
alter table public.account_settings add column if not exists command_notes jsonb not null default '{}'::jsonb;
