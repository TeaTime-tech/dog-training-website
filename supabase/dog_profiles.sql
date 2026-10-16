-- Dog profiles: breed, birthday and notes for each dog (edited on the My Dogs page).
-- Run AFTER schema.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.

-- e.g. "Border Collie" or "Mixed"; null when not entered
alter table public.dogs add column if not exists breed text;

-- used to show the dog's age; null when not entered
alter table public.dogs add column if not exists birthday date;

-- anything worth remembering: temperament, health, what motivates them
alter table public.dogs add column if not exists notes text;

alter table public.dogs drop constraint if exists dogs_breed_length_check;
alter table public.dogs add constraint dogs_breed_length_check
  check (breed is null or char_length(breed) <= 60);

alter table public.dogs drop constraint if exists dogs_notes_length_check;
alter table public.dogs add constraint dogs_notes_length_check
  check (notes is null or char_length(notes) <= 1000);
