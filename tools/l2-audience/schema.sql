-- Ax L2 Audience Builder — job queue + history
-- =====================================================================
-- Runs in the SAME Supabase project as io_history / billing_rows.
--
-- WHAT THIS TABLE IS — the coordination layer between the toolkit UI
-- (browser, cloud) and the per-user L2 worker (local, drives Playwright
-- against L2 Datamapping). The browser INSERTs a job; the local worker
-- CLAIMs it, runs the build, and streams progress + the final result
-- back into the same row. The browser subscribes via Realtime to render
-- the live "thinking" log, the audience size, and the scraped L2
-- definition for verification. The history view is just a select over
-- this table.
--
-- TRUST MODEL — like io_history, this table is intentionally open to the
-- project's anon key (there is no login gate on the toolkit). Anyone who
-- opens the tool can read every job. Acceptable for an internal,
-- unadvertised tool. CRITICAL: no L2 password (or any credential) ever
-- goes in this table. L2 auth lives only in each worker's local session
-- cookie (.auth/l2.json); the worker refreshes it via a headed login
-- window on the user's own machine. Nothing secret touches the cloud.
--
-- MULTI-USER ROUTING — every job carries `owner` (an email). Each local
-- worker is configured with its own OWNER and claims only
-- `where owner = <me> and status = 'pending'`, so two people running two
-- workers against two L2 accounts share one queue without collisions.
-- History is team-wide (the UI shows all owners' jobs).
--
-- DESIGN — `spec` JSONB holds the full AudienceSpec (state, party,
-- voterType, turnout, geos) exactly as the L2 driver consumes it, so the
-- form never has to round-trip through the shorthand parser. `result`
-- JSONB holds what we scrape back from L2 (size + definition + universe
-- id). Promoted columns exist only for the history table's quick columns,
-- ordering, and the worker's claim query.
-- =====================================================================

create table if not exists audience_jobs (
  id                  uuid primary key default gen_random_uuid(),

  -- routing + ownership
  owner               text not null,                 -- email; worker claims its own
  kind                text not null default 'build', -- 'build' | 'push'
  status              text not null default 'pending',
    -- lifecycle: pending -> claimed -> running -> [awaiting_login -> running] -> done
    --            (any state) -> error
  claimed_by          text,                          -- worker/machine id that took it
  claimed_at          timestamptz,

  -- request
  audience_name       text not null default '',
  notification_email  text default '',               -- used at Nexxen-push time
  spec                jsonb,                          -- AudienceSpec (build jobs)

  -- push linkage (Nexxen path — schema-ready, wired later)
  source_job_id       uuid references audience_jobs(id) on delete set null,
  advertiser_id       text,
  market_id           text,

  -- promoted from spec for the history table's quick columns
  state               text default '',               -- e.g. 'NV'
  estimated_count     integer,                        -- scraped L2 universe size

  -- live + result
  progress            jsonb not null default '[]'::jsonb,  -- [{ ts, msg }] appended by worker
  result              jsonb,                          -- { estimatedCount, definition, universeId }
  error               text,

  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- worker poll: cheap lookup of this owner's next pending job
create index if not exists audience_jobs_claim_idx
  on audience_jobs (owner, status);
-- history: newest first
create index if not exists audience_jobs_created_idx
  on audience_jobs (created_at desc);

alter table audience_jobs enable row level security;

-- Anon-accessible. See "TRUST MODEL" at top of file. No secrets live here.
create policy "anon read"   on audience_jobs for select to anon using (true);
create policy "anon insert" on audience_jobs for insert to anon with check (true);
create policy "anon update" on audience_jobs for update to anon using (true) with check (true);
create policy "anon delete" on audience_jobs for delete to anon using (true);

grant select, insert, update, delete on audience_jobs to anon;

-- live progress stream + history sync across open tabs
alter publication supabase_realtime add table audience_jobs;
