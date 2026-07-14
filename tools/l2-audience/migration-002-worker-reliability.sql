-- Ax L2 Audience Builder — migration 002
-- Worker reliability: stuck-job recovery, worker presence/version, structured
-- failure diagnostics, double-submit guard.
-- =====================================================================
-- Run in the Supabase SQL editor for project joojunnbkzebulolnliq.
-- Safe to run more than once (everything is IF NOT EXISTS / additive).
-- Pairs with worker v0.4+ (mcp-servers/l2-audience). Old workers keep
-- functioning against this schema; new workers keep functioning WITHOUT this
-- migration (they detect missing columns and degrade gracefully) — but the
-- reliability features below only light up once it runs.
--
-- WHAT EACH PIECE IS FOR
--
-- 1) audience_jobs.attempts — stuck-job recovery. The worker heartbeats
--    updated_at every 45s while a job runs. A claimed/running job whose
--    updated_at is >4min old was abandoned (worker crash, laptop sleep); the
--    owner's worker requeues it (attempts+1) or, after 2 requeues, marks it
--    errored so a poison job can't ping-pong forever. awaiting_login jobs
--    that outlive the login window get errored, not requeued.
--
-- 2) audience_jobs.worker_version + worker_status — update propagation and
--    "no worker online" detection. Every worker upserts its presence row
--    ~every 30s and stamps worker_version on each claim. UI usage:
--      • job stuck in 'pending' AND (no worker_status row for its owner OR
--        last_seen older than ~90s) → show "no worker is online for
--        <owner> — this job will not run until they start one."
--      • worker_status.version < the version the UI was built against →
--        show "…is running an outdated worker (vX) — ask them to
--        git pull && npm run build".
--
-- 3) audience_jobs.error_context — structured failure diagnostics pushed by
--    the worker: { step, url, screenshot, treeLabels, electionCategories,
--    activeFilters, warnings }. Failures become debuggable from the row
--    alone, without access to the worker machine.
--
-- 4) audience_jobs_active_name_uniq — double-submit guard. Two ACTIVE
--    (pending/claimed/running/awaiting_login) build jobs with the same owner
--    and audience name cannot coexist; the second INSERT fails and the UI
--    should surface "already queued". Finished jobs don't block reruns.
--    (The worker also refuses to build if a universe with the same name
--    already exists in L2 — belt and suspenders.)
--
-- TRUST MODEL / BLAST RADIUS (unchanged, but worth restating): audience_jobs
-- and worker_status are open to anon + authenticated for select/insert/
-- update/delete — anyone with the project URL + anon key (both shipped in the
-- public toolkit page) can read every job, forge progress, mark jobs done,
-- requeue or delete them, and spoof worker presence. No credentials ever live
-- in these tables (L2 auth stays in each worker's local cookie file), so the
-- blast radius is job-queue vandalism / information disclosure of audience
-- definitions, not account compromise. Acceptable for an internal,
-- unadvertised tool; revisit if the toolkit ever gets a public URL with real
-- traffic (the fix: Supabase Auth + per-owner RLS like io_history's
-- migration-001).
-- =====================================================================

-- 1) + 3) new columns (additive, nullable/defaulted — old rows unaffected)
alter table audience_jobs add column if not exists attempts       integer not null default 0;
alter table audience_jobs add column if not exists worker_version text;
alter table audience_jobs add column if not exists error_context  jsonb;

-- 4) double-submit guard
create unique index if not exists audience_jobs_active_name_uniq
  on audience_jobs (owner, kind, audience_name)
  where status in ('pending','claimed','running','awaiting_login')
    and audience_name <> '';

-- 2) worker presence
create table if not exists worker_status (
  owner      text primary key,          -- one live worker per owner
  worker_id  text not null,             -- hostname (or WORKER_ID override)
  version    text not null default '',  -- worker build version (package.json)
  last_seen  timestamptz not null default now()
);

alter table worker_status enable row level security;

drop policy if exists "open read"   on worker_status;
drop policy if exists "open insert" on worker_status;
drop policy if exists "open update" on worker_status;
drop policy if exists "open delete" on worker_status;

create policy "open read"   on worker_status for select to anon, authenticated using (true);
create policy "open insert" on worker_status for insert to anon, authenticated with check (true);
create policy "open update" on worker_status for update to anon, authenticated using (true) with check (true);
create policy "open delete" on worker_status for delete to anon, authenticated using (true);

grant select, insert, update, delete on worker_status to anon, authenticated;

-- live presence in the UI without polling
do $$
begin
  alter publication supabase_realtime add table worker_status;
exception when duplicate_object then
  null; -- already in the publication (rerun)
end $$;
