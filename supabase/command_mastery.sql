-- Command mastery: training sessions, mastery tiers with tiered decay, and the account-level decay toggle.
-- Run AFTER schema.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once: anything that already exists is kept.

-- one row per logged training session (mirrors the log page form)
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  dog_id uuid references public.dogs (id) on delete cascade,
  command text not null,
  repetitions integer,
  duration text,
  distractions text,
  location text,
  session_date date not null default current_date,
  session_time time,
  total_minutes integer,
  notes text,
  session_start_time text,
  session_end_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- for tables created before session sync: start/end times from the log page, and last-edit time
-- (the browser sets it, and the newer copy wins when two devices edit the same session)
alter table public.training_sessions add column if not exists session_start_time text;
alter table public.training_sessions add column if not exists session_end_time text;
alter table public.training_sessions add column if not exists updated_at timestamptz not null default now();

create index if not exists training_sessions_account_id_lower_idx on public.training_sessions (account_id, lower(command));
create index if not exists training_sessions_dog_id_idx on public.training_sessions (dog_id);

grant select, insert, update, delete on public.training_sessions to authenticated;
alter table public.training_sessions enable row level security;

drop policy if exists "own sessions" on public.training_sessions;
create policy "own sessions" on public.training_sessions
  for all to authenticated
  using (account_id = auth.uid())
  with check (account_id = auth.uid());


-- per-account preferences
create table if not exists public.account_settings (
  account_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  mastery_decay_enabled boolean not null default true,
  display_name text,
  updated_at timestamptz not null default now()
);

-- for tables created before display_name was added
alter table public.account_settings add column if not exists display_name text;

grant select, insert, update, delete on public.account_settings to authenticated;
alter table public.account_settings enable row level security;

drop policy if exists "own settings" on public.account_settings;
create policy "own settings" on public.account_settings
  for all to authenticated
  using (account_id = auth.uid())
  with check (account_id = auth.uid());


-- mastery levels. A command earns a level (its base level) once it meets every minimum in that row.
-- decay_after_days: days without practice before a command drops from this level to the one below.
-- Higher levels are better consolidated, so they hold longer. null = never decays below this level.
-- Edit these rows to retune mastery; no code changes needed.
create table if not exists public.mastery_tiers (
  level smallint primary key,
  name text not null,
  min_sessions integer not null,
  min_training_days integer not null,
  min_distraction_sessions integer not null,
  min_locations integer not null,
  min_span_days integer not null,
  decay_after_days integer
);

insert into public.mastery_tiers
  (level, name,          min_sessions, min_training_days, min_distraction_sessions, min_locations, min_span_days, decay_after_days)
values
  (0,     'Not started', 0,            0,                 0,                        0,             0,             null),
  (1,     'Learning',    1,            1,                 0,                        1,             0,             null),
  (2,     'Practicing',  5,            3,                 0,                        1,             0,             10),
  (3,     'Reliable',    10,           5,                 3,                        2,             7,             14),
  (4,     'Proofed',     20,           8,                 5,                        3,             14,            21),
  (5,     'Mastered',    35,           15,                10,                       3,             30,            30)
on conflict (level) do nothing;

grant select on public.mastery_tiers to authenticated;
alter table public.mastery_tiers enable row level security;

drop policy if exists "anyone signed in can read tiers" on public.mastery_tiers;
create policy "anyone signed in can read tiers" on public.mastery_tiers
  for select to authenticated
  using (true);


-- walk a base level down one tier at a time, spending each tier's decay window of idle days
create or replace function public.mastery_apply_decay(
  p_base_level smallint,
  p_days_idle integer,
  out decayed_level smallint,
  out days_until_drop integer
)
language plpgsql
stable
set search_path = public
as $$
declare
  remaining integer := greatest(coalesce(p_days_idle, 0), 0);
  step integer;
begin
  decayed_level := p_base_level;
  loop
    select t.decay_after_days into step from mastery_tiers t where t.level = decayed_level;
    exit when step is null or remaining <= step;
    remaining := remaining - step;
    decayed_level := decayed_level - 1;
  end loop;
  -- a command drops once idle days exceed the window, so it's safe through day `step`
  days_until_drop := case when step is null then null else step - remaining + 1 end;
end;
$$;


-- mastery for every command the signed-in account has practiced.
-- p_dog_id: limit to one dog (null = all sessions). p_today: pass the browser's local date so decay matches the user's day.
-- base_level never goes down; decayed_level accounts for time since last practice;
-- display_level is whichever one the account's mastery_decay_enabled setting says to show.
create or replace function public.get_command_mastery(
  p_dog_id uuid default null,
  p_today date default current_date
)
returns table (
  command text,
  session_count integer,
  training_days integer,
  distraction_sessions integer,
  location_count integer,
  first_practiced date,
  last_practiced date,
  days_since_practice integer,
  base_level smallint,
  base_level_name text,
  decayed_level smallint,
  decayed_level_name text,
  days_until_decay integer,
  decay_enabled boolean,
  display_level smallint,
  display_level_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with settings as (
    select coalesce(
      (select s.mastery_decay_enabled from account_settings s where s.account_id = auth.uid()),
      true
    ) as decay_enabled
  ),
  stats as (
    select
      min(ts.command) as command,
      count(*)::integer as session_count,
      count(distinct ts.session_date)::integer as training_days,
      count(*) filter (
        where coalesce(lower(trim(ts.distractions)), 'none') not in ('none', '', 'n/a')
      )::integer as distraction_sessions,
      count(distinct lower(trim(ts.location))) filter (
        where coalesce(trim(ts.location), '') <> ''
      )::integer as location_count,
      min(ts.session_date) as first_practiced,
      max(ts.session_date) as last_practiced
    from training_sessions ts
    where ts.account_id = auth.uid()
      and (p_dog_id is null or ts.dog_id = p_dog_id)
    group by lower(trim(ts.command))
  ),
  leveled as (
    select
      st.*,
      greatest(p_today - st.last_practiced, 0) as days_idle,
      (
        select max(t.level)
        from mastery_tiers t
        where st.session_count >= t.min_sessions
          and st.training_days >= t.min_training_days
          and st.distraction_sessions >= t.min_distraction_sessions
          and st.location_count >= t.min_locations
          and (st.last_practiced - st.first_practiced) >= t.min_span_days
      ) as base_level
    from stats st
  ),
  decayed as (
    select l.*, d.decayed_level, d.days_until_drop
    from leveled l
    cross join lateral mastery_apply_decay(l.base_level, l.days_idle) d
  )
  select
    d.command,
    d.session_count,
    d.training_days,
    d.distraction_sessions,
    d.location_count,
    d.first_practiced,
    d.last_practiced,
    d.days_idle,
    d.base_level,
    bt.name,
    d.decayed_level,
    dt.name,
    d.days_until_drop,
    s.decay_enabled,
    case when s.decay_enabled then d.decayed_level else d.base_level end,
    case when s.decay_enabled then dt.name else bt.name end
  from decayed d
  cross join settings s
  join mastery_tiers bt on bt.level = d.base_level
  join mastery_tiers dt on dt.level = d.decayed_level
  order by d.command;
$$;

grant execute on function public.get_command_mastery(uuid, date) to authenticated;
grant execute on function public.mastery_apply_decay(smallint, integer) to authenticated;
