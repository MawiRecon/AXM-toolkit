-- AxMedia Primary Tracker — Supabase setup (canonical fresh install)
-- ---------------------------------------------------------------
-- Run this once in your Supabase project's SQL Editor for a brand-new
-- project. For upgrading an existing v1 schema, run migration-001-*.sql
-- instead.
--
-- Creates the roster + events tables, opens public anon read/write,
-- and turns on realtime so multiple browsers stay in sync.
-- ---------------------------------------------------------------

-- Roster: clients we're tracking
create table if not exists roster (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  state             text not null,
  office            text not null,
  district          text default '',
  source            text default 'manual',  -- 'auto' (NBC match) or 'manual'
  custom_notes      text default '',        -- per-client annotation
  slack_webhook_url text default '',        -- Slack incoming webhook for per-client reminders
  runoff_date       date,                   -- per-client runoff override (replaces primary date when set)
  runoff_notes      text default '',
  created_at        timestamptz default now()
);

alter table roster enable row level security;

create policy "Public read"   on roster for select to anon using (true);
create policy "Public insert" on roster for insert to anon with check (true);
create policy "Public delete" on roster for delete to anon using (true);
create policy "Public update" on roster for update to anon using (true) with check (true);

alter publication supabase_realtime add table roster;

-- Events: user-added calendar entries (runoffs and future event kinds)
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  state       text not null,
  offices     text[] not null default '{}',
  notes       text default '',
  kind        text not null default 'runoff',
  created_at  timestamptz default now()
);

alter table events enable row level security;

create policy "Public read"   on events for select to anon using (true);
create policy "Public insert" on events for insert to anon with check (true);
create policy "Public delete" on events for delete to anon using (true);
create policy "Public update" on events for update to anon using (true) with check (true);

alter publication supabase_realtime add table events;
