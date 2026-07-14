-- Ax L2 Audience Builder — migration 001
-- Broaden audience_jobs RLS from anon-only to anon + authenticated.
-- =====================================================================
-- WHY: the AXM tools share one Supabase project (joojunnbkzebulolnliq) and
-- one GitHub Pages origin. AX Billing signs into Supabase Auth on this same
-- project, and supabase-js persists that session in localStorage. Any sibling
-- tool's client (including this one) then restores that session and sends an
-- AUTHENTICATED JWT instead of the anon key. The original policies granted
-- only the `anon` role, so authenticated inserts failed with:
--   "new row violates row-level security policy for table audience_jobs"
--
-- The client-side fix (persistSession:false in tools/l2-audience/index.html)
-- keeps this tool on the anon key. This migration is the belt-and-suspenders
-- DB-side fix: it extends the SAME intentionally-open access to the
-- `authenticated` role, so the queue works no matter which key a browser
-- happens to send. Still no secrets in this table — see schema.sql TRUST MODEL.
--
-- Safe to run more than once (drop-if-exists then recreate).
-- Run in the Supabase SQL editor for project joojunnbkzebulolnliq.
-- =====================================================================

drop policy if exists "anon read"   on audience_jobs;
drop policy if exists "anon insert" on audience_jobs;
drop policy if exists "anon update" on audience_jobs;
drop policy if exists "anon delete" on audience_jobs;

create policy "open read"   on audience_jobs for select to anon, authenticated using (true);
create policy "open insert" on audience_jobs for insert to anon, authenticated with check (true);
create policy "open update" on audience_jobs for update to anon, authenticated using (true) with check (true);
create policy "open delete" on audience_jobs for delete to anon, authenticated using (true);

grant select, insert, update, delete on audience_jobs to anon, authenticated;
