-- AxMedia Primary Tracker — Migration 002
-- ---------------------------------------------------------------
-- Adds a per-client Slack incoming-webhook URL field to the roster
-- table. Each client can have its own webhook URL (typically tied
-- to a client-specific Slack channel). Empty string by default.
--
-- Idempotent: safe to run more than once.
-- The UPDATE policy from migration-001 already covers writes to
-- this column.
-- ---------------------------------------------------------------

alter table roster add column if not exists slack_webhook_url text default '';
