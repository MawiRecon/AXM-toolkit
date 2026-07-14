-- AxMedia Primary Tracker — Migration 003
-- ---------------------------------------------------------------
-- Reworks runoffs from a state-wide events table to per-client
-- columns on the roster row. Each client can carry an optional
-- runoff_date that overrides the state's primary date for that
-- client only — other clients in the same state are unaffected.
--
-- The events table from migration-001 is no longer used by the
-- app. It is left in place (not dropped) so any rows you added
-- via the previous Add Runoff form are preserved if you need to
-- copy data over manually. Drop it later if you want.
--
-- Idempotent: safe to run more than once.
-- ---------------------------------------------------------------

alter table roster add column if not exists runoff_date  date;
alter table roster add column if not exists runoff_notes text default '';
