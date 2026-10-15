-- Score and weather for training sessions (logged on the Log page, shown per Commands > Display Settings).
-- Run AFTER command_mastery.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.

-- how well the session went, 1 (poor) to 10 (perfect); null when not scored
alter table public.training_sessions add column if not exists score smallint;

alter table public.training_sessions drop constraint if exists training_sessions_score_check;
alter table public.training_sessions add constraint training_sessions_score_check
  check (score is null or score between 1 and 10);

-- weather during the session, e.g. "sunny" or "indoors"; null when not recorded
alter table public.training_sessions add column if not exists weather text;
