-- Ax Billing Tracker — Supabase setup
-- =====================================================================
-- Run once in the shared AXM Supabase project's SQL Editor (project
-- joojunnbkzebulolnliq — the same project used by the IO Autofiller,
-- L2 Audience, and the Primary Tracker). This just adds one table.
--
-- IMPORTANT — this table is NOT public. Unlike the roster/events tables,
-- RLS here grants access only to an AUTHENTICATED session. The public
-- anon key in the page can therefore read/write nothing until someone
-- signs in with the shared account. That shared login IS the passphrase.
--
-- After running this:
--   1. Authentication > Providers > Email: enable it, and DISABLE
--      "Confirm email" (so the shared account can be used immediately).
--   2. Authentication > Users > Add user (NOT "Invite" — invite emails a link):
--      create ONE shared account. The email is just a label; nothing is sent.
--      It MUST match SHARED_EMAIL in tools/ax-billing/config.js — currently
--      mason.widmer@grapeseedmedia.com. Set its PASSWORD to the team's shared
--      PIN (use 6+ digits — this is the real key to the data, and Supabase
--      rate-limits guesses). That PIN is what the app's gate asks for.
--   3. If you change the account, update SHARED_EMAIL in config.js to match
--      (BACKEND is already 'supabase').
-- =====================================================================

create table if not exists billing_rows (
  id                        uuid primary key default gen_random_uuid(),

  -- entered columns (mirror of the Sheet's manual cells)
  campaign_name             text default '',   -- A: finalized IO name (Entity | Advertiser | Campaign | Start)
  campaign_label            text default '',   -- the raw campaign/project name (kept so A can be recomposed)
  year                      int,               -- C
  campaign_start            date,              -- D
  campaign_end              date,              -- E
  entity                    text default '',   -- F
  advertiser                text default '',   -- G
  io_amount                 numeric,           -- H
  actual_spend              numeric,           -- I
  rebate_pct                numeric default 0.15, -- K  (defaults to 15%)
  margin                    numeric,           -- N
  previous_backend          numeric,           -- R
  backend_adjustment        numeric,           -- S
  amount_paid               numeric,           -- T
  io_paid                   boolean default false, -- U
  rebate_paid               boolean default false, -- V
  delta_status              text default '',   -- W
  invoice_no                text default '',   -- X
  bill_direct               boolean default false, -- Y
  notes                     text default '',   -- Z
  internal_note             text default '',   -- AA

  -- overrides: when non-null, they replace the computed P / Q (spreadsheet
  -- behavior — a hand-typed value beats the formula). Null => use formula.
  backend_rebate_override   numeric,           -- P override
  difference_owed_override  numeric,           -- Q override

  source                    text default 'manual', -- 'manual' | 'io-tool'
  sort_order                double precision default 0,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

alter table billing_rows enable row level security;

-- Authenticated-only. No anon policies on purpose.
create policy "auth read"   on billing_rows for select to authenticated using (true);
create policy "auth insert" on billing_rows for insert to authenticated with check (true);
create policy "auth update" on billing_rows for update to authenticated using (true) with check (true);
create policy "auth delete" on billing_rows for delete to authenticated using (true);

-- Grants are defense-in-depth: authenticated gets full CRUD, anon gets NOTHING
-- at the privilege level too (not just RLS). This makes the table safe no
-- matter how "Automatically expose new tables" is set on the project.
grant select, insert, update, delete on billing_rows to authenticated;
revoke all on billing_rows from anon;

-- keep everyone's grids in sync
alter publication supabase_realtime add table billing_rows;

-- NOTE on derived columns (Delta, Rebate Value, Sent-to-Grapeseed, Gross Profit,
-- Back-End Rebate, Difference Owed): these are computed CLIENT-SIDE in rebate.js,
-- which is the single source of truth for the math. We deliberately do NOT keep a
-- SQL view (previously `billing_rows_full`) that recomputes them — a second copy of
-- the formulas silently drifts from rebate.js. If you ever need the derived values
-- in a raw SQL query, compute them there against rebate.js rather than reviving a view.
-- (If an old billing_rows_full view still exists in the project, drop it:
--    drop view if exists billing_rows_full; )
