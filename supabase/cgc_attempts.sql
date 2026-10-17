-- Canine Good Citizen attempts: every pass/fail try at a CGC step, per dog (logged on the Commands page).
-- Run AFTER schema.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.
-- dog_task_progress.completed_at still says whether a step's latest attempt passed; this keeps the full history.

create table if not exists public.dog_task_attempts (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  task_list_item_id uuid not null references public.task_list_items (id) on delete cascade,
  attempted_on date not null default current_date,
  result text not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.dog_task_attempts drop constraint if exists dog_task_attempts_result_check;
alter table public.dog_task_attempts add constraint dog_task_attempts_result_check
  check (result in ('pass', 'fail'));

alter table public.dog_task_attempts drop constraint if exists dog_task_attempts_notes_length_check;
alter table public.dog_task_attempts add constraint dog_task_attempts_notes_length_check
  check (notes is null or char_length(notes) <= 500);

create index if not exists dog_task_attempts_dog_item_idx on public.dog_task_attempts (dog_id, task_list_item_id);

grant select, insert, update, delete on public.dog_task_attempts to authenticated;

alter table public.dog_task_attempts enable row level security;

drop policy if exists "attempts of own dogs" on public.dog_task_attempts;
create policy "attempts of own dogs" on public.dog_task_attempts
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.account_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.account_id = auth.uid()));
