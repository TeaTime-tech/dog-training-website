-- Feedback: problems and ideas sent from Settings > Help and Feedback. Anyone can send one (signed in or not);
-- nobody can read them from the website. Read them in the Supabase dashboard: Table Editor > feedback.
-- Run AFTER schema.sql: SQL Editor > New query > paste this file > Run.
-- Safe to run more than once.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  -- who sent it when signed in; null when signed out (or once the account is deleted)
  account_id uuid references auth.users (id) on delete set null default auth.uid(),
  -- 'problem', 'idea' or 'other'
  kind text not null,
  message text not null,
  -- where to reply, if they want a reply
  contact_email text,
  -- the page and browser it was sent from, to help reproduce problems
  page text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.feedback drop constraint if exists feedback_kind_check;
alter table public.feedback add constraint feedback_kind_check check (kind in ('problem', 'idea', 'other'));

alter table public.feedback drop constraint if exists feedback_message_length_check;
alter table public.feedback add constraint feedback_message_length_check
  check (char_length(trim(message)) between 1 and 2000);

alter table public.feedback drop constraint if exists feedback_contact_length_check;
alter table public.feedback add constraint feedback_contact_length_check
  check (contact_email is null or char_length(contact_email) <= 200);

alter table public.feedback drop constraint if exists feedback_extra_length_check;
alter table public.feedback add constraint feedback_extra_length_check
  check ((page is null or char_length(page) <= 200) and (user_agent is null or char_length(user_agent) <= 500));

-- send only: no select, update or delete from the website
revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to anon, authenticated;

alter table public.feedback enable row level security;

-- signed out, it's sent with no account; signed in, only as yourself
drop policy if exists "anyone can send feedback" on public.feedback;
create policy "anyone can send feedback" on public.feedback
  for insert to anon, authenticated
  with check (account_id is null or account_id = auth.uid());
