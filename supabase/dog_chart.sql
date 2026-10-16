-- Dog chart: the full profile filled out on dog.html (basics, health & vet, care & routine, behavior).
-- Run AFTER dog_profiles.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.

-- one JSON object per dog, e.g. { "sex": "Female", "weight": "42", "weightUnit": "lb",
--   "vaccinations": [{ "name": "Rabies", "given": "2026-03-01", "due": "2027-03-01" }], ... }
-- name, breed, birthday and notes stay in their own columns
alter table public.dogs add column if not exists profile jsonb not null default '{}'::jsonb;

alter table public.dogs drop constraint if exists dogs_profile_check;
alter table public.dogs add constraint dogs_profile_check
  check (jsonb_typeof(profile) = 'object' and pg_column_size(profile) <= 32768);
