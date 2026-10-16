-- Each account's own command list: commands it added and commands it removed.
-- Run AFTER command_mastery.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.

-- null until the account first saves its lists (the browser's lists are adopted then)
-- custom_commands: ["zoomies", "Heel Left", ...] as typed; hidden_commands: ["heel", ...] lowercase
alter table public.account_settings add column if not exists custom_commands jsonb;
alter table public.account_settings add column if not exists hidden_commands jsonb;
