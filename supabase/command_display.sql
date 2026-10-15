-- Per-command display settings (which fields show for each command on the Log and Today pages).
-- Run AFTER command_mastery.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.

-- { "sit": { "repetitions": true, "duration": false, ... }, ... } keyed by lowercase command name
alter table public.account_settings add column if not exists command_display jsonb not null default '{}'::jsonb;
