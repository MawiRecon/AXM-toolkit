-- AxMedia Primary Tracker — Migration 001
-- ---------------------------------------------------------------
-- Run this once in your Supabase project's SQL Editor to upgrade
-- an existing v1 schema to support:
--   • per-client Custom Notes on roster rows
--   • editing existing roster rows (Race + Custom Notes)
--   • user-added runoff events (and any future event kinds)
--
-- Idempotent: safe to run more than once.
-- ---------------------------------------------------------------

-- 1. Custom notes column for per-client annotations
alter table roster add column if not exists custom_notes text default '';

-- 2. Allow anon updates so the Edit button can save changes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'roster' and policyname = 'Public update'
  ) then
    create policy "Public update" on roster
      for update to anon
      using (true) with check (true);
  end if;
end $$;

-- 3. Events table — runoffs (and any future user-added calendar events)
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

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='Public read') then
    create policy "Public read" on events for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='Public insert') then
    create policy "Public insert" on events for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='Public delete') then
    create policy "Public delete" on events for delete to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='events' and policyname='Public update') then
    create policy "Public update" on events for update to anon using (true) with check (true);
  end if;
end $$;

-- 4. Realtime broadcast for events (idempotent — Postgres errors loudly if already added)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table events;
  end if;
end $$;
