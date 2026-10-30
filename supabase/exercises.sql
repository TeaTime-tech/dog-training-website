-- Exercises (walks, fetch, swims...): each one logged on Today, per dog, synced like training_sessions.
-- Run AFTER schema.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  -- the dog it was logged for; deleting the dog deletes its exercises
  dog_id uuid references public.dogs (id) on delete cascade,
  name text not null,
  -- as entered: seconds ("45") or minutes:seconds ("10:00")
  duration text,
  -- or tracked by distance instead: the number and unit as entered (mi, km, m or ft)
  distance numeric,
  distance_unit text,
  notes text,
  exercise_date date not null default current_date,
  exercise_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- for tables made before distance tracking
alter table public.exercises add column if not exists distance numeric;
alter table public.exercises add column if not exists distance_unit text;

alter table public.exercises drop constraint if exists exercises_distance_check;
alter table public.exercises add constraint exercises_distance_check check (
  (distance is null and distance_unit is null)
  or (distance > 0 and distance_unit in ('mi', 'km', 'm', 'ft'))
);

alter table public.exercises drop constraint if exists exercises_name_length_check;
alter table public.exercises add constraint exercises_name_length_check check (char_length(name) <= 100);

alter table public.exercises drop constraint if exists exercises_notes_length_check;
alter table public.exercises add constraint exercises_notes_length_check check (notes is null or char_length(notes) <= 1000);

create index if not exists exercises_account_id_idx on public.exercises (account_id);
create index if not exists exercises_dog_id_idx on public.exercises (dog_id);

grant select, insert, update, delete on public.exercises to authenticated;

alter table public.exercises enable row level security;

-- your own exercises, and only for your own dogs
drop policy if exists "own exercises" on public.exercises;
create policy "own exercises" on public.exercises
  for all to authenticated
  using (account_id = auth.uid())
  with check (
    account_id = auth.uid()
    and (dog_id is null or exists (select 1 from public.dogs d where d.id = dog_id and d.account_id = auth.uid()))
  );
