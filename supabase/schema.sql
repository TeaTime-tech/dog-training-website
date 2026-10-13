-- Dog training app database schema.
-- Run in the Supabase dashboard: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once: anything that already exists is kept.
-- Every table has row level security so each account can only see its own data.

-- dogs belonging to an account
create table if not exists public.dogs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- checklists such as the Canine Good Citizen test
create table if not exists public.task_lists (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  description text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- the steps inside a task list
create table if not exists public.task_list_items (
  id uuid primary key default gen_random_uuid(),
  task_list_id uuid not null references public.task_lists (id) on delete cascade,
  name text not null,
  directions text,
  sort_order integer not null default 0
);

-- which steps each dog has completed
create table if not exists public.dog_task_progress (
  dog_id uuid not null references public.dogs (id) on delete cascade,
  task_list_item_id uuid not null references public.task_list_items (id) on delete cascade,
  completed_at timestamptz,
  notes text,
  primary key (dog_id, task_list_item_id)
);

create index if not exists dogs_account_id_idx on public.dogs (account_id);
create index if not exists task_lists_account_id_idx on public.task_lists (account_id);
create index if not exists task_list_items_task_list_id_idx on public.task_list_items (task_list_id);

-- let signed-in users reach these tables at all; the policies below then limit them to their own rows
grant select, insert, update, delete on public.dogs, public.task_lists, public.task_list_items, public.dog_task_progress to authenticated;

alter table public.dogs enable row level security;
alter table public.task_lists enable row level security;
alter table public.task_list_items enable row level security;
alter table public.dog_task_progress enable row level security;

drop policy if exists "own dogs" on public.dogs;
create policy "own dogs" on public.dogs
  for all to authenticated
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

drop policy if exists "own task lists" on public.task_lists;
create policy "own task lists" on public.task_lists
  for all to authenticated
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

drop policy if exists "items of own task lists" on public.task_list_items;
create policy "items of own task lists" on public.task_list_items
  for all to authenticated
  using (exists (select 1 from public.task_lists l where l.id = task_list_id and l.account_id = auth.uid()))
  with check (exists (select 1 from public.task_lists l where l.id = task_list_id and l.account_id = auth.uid()));

drop policy if exists "progress of own dogs" on public.dog_task_progress;
create policy "progress of own dogs" on public.dog_task_progress
  for all to authenticated
  using (exists (select 1 from public.dogs d where d.id = dog_id and d.account_id = auth.uid()))
  with check (exists (select 1 from public.dogs d where d.id = dog_id and d.account_id = auth.uid()));
