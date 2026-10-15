-- Daily goals (sessions / minutes / commands per day) and which one the Today ring tracks.
-- Run AFTER command_mastery.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once: anything that already exists is kept.

-- one row per goal type per period; dog_id null = applies to all dogs
create table if not exists public.training_goals (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  dog_id uuid references public.dogs (id) on delete cascade,
  goal_type text not null check (goal_type in ('sessions', 'minutes', 'commands')),
  period text not null default 'daily' check (period in ('daily')),
  target integer not null check (target > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- at most one goal of each type per dog (or for all dogs) per period
create unique index if not exists training_goals_unique_idx
  on public.training_goals (account_id, dog_id, goal_type, period) nulls not distinct;

grant select, insert, update, delete on public.training_goals to authenticated;
alter table public.training_goals enable row level security;

drop policy if exists "own goals" on public.training_goals;
create policy "own goals" on public.training_goals
  for all to authenticated
  using (account_id = auth.uid())
  with check (
    account_id = auth.uid()
    and (dog_id is null or exists (select 1 from public.dogs d where d.id = dog_id and d.account_id = auth.uid()))
  );

-- which goal type the Today page's ring tracks
alter table public.account_settings add column if not exists active_goal_type text;

alter table public.account_settings drop constraint if exists account_settings_active_goal_type_check;
alter table public.account_settings add constraint account_settings_active_goal_type_check
  check (active_goal_type in ('sessions', 'minutes', 'commands'));
