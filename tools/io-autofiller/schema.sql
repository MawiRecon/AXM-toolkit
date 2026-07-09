-- Ax IO Autofiller — history
-- =====================================================================
-- Runs in the SAME Supabase project as ax-billing. Independent table
-- (billing_rows stays auth-gated; io_history is anon-accessible).
--
-- TRUST MODEL — this table is intentionally open to anon. There is NO
-- login gate on the IO Autofiller, so read/write is granted to the
-- project's public anon key. Consequence: anyone who visits the tool
-- URL can list all IO history (advertiser names, budgets, contacts).
-- Acceptable for an internal, unadvertised tool. If that ever stops
-- being true, tighten these policies to `authenticated` and mirror the
-- shared-login pattern from billing_rows.
--
-- DESIGN — `fields` JSONB holds the entire collectIoValues() snapshot
-- plus the Pipedrive-defaults card. Promoted columns exist only for
-- lookup, ordering, and dedupe. Adding a new form field never requires
-- a migration — it just shows up in `fields` on the next save.
-- =====================================================================

create table if not exists io_history (
  id                 uuid primary key default gen_random_uuid(),

  -- promoted columns (for the "recent IOs" picker + dedupe)
  advertiser         text default '',
  agency             text default '',
  campaign           text default '',
  flight_start       date,
  flight_end         date,
  io_title           text default '',   -- composed "Agency | Advertiser | Campaign | MonYear"

  -- source pointer — a re-fetch from the same Monday submission upserts
  -- instead of duplicating a row.
  monday_item_id     text,

  -- full form snapshot. Top-level keys mirror collectIoValues() + the
  -- Pipedrive-defaults card:
  --   advertiser, agency, campaign, channels[], budget, cpm, titleDate,
  --   startDate, endDate, flightNotes, landing, geo, tactics, environment,
  --   goal, kpi, secondary, mediaNotes,
  --   contacts{ primary, email, billing, attn },
  --   pipedrive{ orgId, personId, anythingNew, emailProposal,
  --              primaryKpi[], tactics[] }
  fields             jsonb not null,

  source             text default 'io-tool',   -- future-proof: 'io-tool' | 'import' | ...
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists io_history_advertiser_idx  on io_history (lower(advertiser));
create index if not exists io_history_campaign_idx    on io_history (lower(campaign));
create index if not exists io_history_created_at_idx  on io_history (created_at desc);
create unique index if not exists io_history_monday_idx on io_history (monday_item_id)
  where monday_item_id is not null;

alter table io_history enable row level security;

-- Anon-accessible. See "TRUST MODEL" at top of file.
create policy "anon read"   on io_history for select to anon using (true);
create policy "anon insert" on io_history for insert to anon with check (true);
create policy "anon update" on io_history for update to anon using (true) with check (true);
create policy "anon delete" on io_history for delete to anon using (true);

grant select, insert, update, delete on io_history to anon;

-- keep the picker in sync across open tabs
alter publication supabase_realtime add table io_history;
