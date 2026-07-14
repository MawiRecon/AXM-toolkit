-- AxMedia Primary Tracker — Supabase setup (canonical fresh install)
-- ---------------------------------------------------------------
-- Run this once in the SHARED AXM Supabase project (joojunnbkzebulolnliq —
-- the same project used by the IO Autofiller, L2 Audience, and Billing).
-- The Primary Tracker was consolidated onto that project on 2026-07-14
-- (it previously had its own standalone project). config.js already points
-- at it.
--
-- Creates the roster table, opens public anon read/write, and turns on
-- realtime so multiple browsers stay in sync.
--
-- NOTE: the old `events` table (migration-001) is DEAD — migration-003 moved
-- runoffs to per-client roster columns (runoff_date / runoff_notes). It is not
-- created here and has been dropped. Don't re-add it.
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

-- (The `events` table that older versions created here is intentionally gone —
--  see the header note. Runoffs live on roster.runoff_date / roster.runoff_notes.)
