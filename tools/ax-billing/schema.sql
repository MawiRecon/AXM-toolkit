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
  updated_at                timestamptz default now(),
  updated_by                text                   -- self-attested name from the app's "editing as" gate
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


-- =====================================================================
-- CHANGE HISTORY + ATTRIBUTION  (added 2026-07)
-- ---------------------------------------------------------------------
-- The app has no per-person login (one shared PIN). Instead it asks each
-- editor for their name once ("editing as ___", stored in their browser)
-- and stamps it onto billing_rows.updated_by on every write. A trigger
-- then snapshots every insert/update/delete into billing_rows_history so
-- you get a full "who changed this number from X to Y, and when" trail.
--
-- This is attribution, not authentication — anyone with the PIN can type
-- any name. It's a breadcrumb trail among trusted colleagues, nothing more.
--
-- ---- EXISTING DEPLOYMENTS: run this once. -------------------------------
-- The `updated_by` column above is already in the CREATE for fresh installs;
-- on the live table it doesn't exist yet, so add it (no-op if already there):
alter table billing_rows add column if not exists updated_by text;

-- One row per change. old_data/new_data are full-row jsonb snapshots, so the
-- app can diff any field pair without this table needing to know the columns.
create table if not exists billing_rows_history (
  id          bigint generated always as identity primary key,
  row_id      uuid        not null,          -- billing_rows.id (NOT a FK: survives row deletion)
  action      text        not null,          -- 'insert' | 'update' | 'delete'
  actor       text,                          -- who (billing_rows.updated_by at the time)
  campaign    text,                          -- denormalized name, so raw queries are readable
  changed_at  timestamptz not null default now(),
  old_data    jsonb,                         -- null on insert
  new_data    jsonb                          -- null on delete
);
create index if not exists billing_history_row_idx on billing_rows_history (row_id, changed_at desc);

-- SECURITY DEFINER so the trigger can always write history regardless of the
-- caller's grants; the actor rides in on the row's own updated_by column, so no
-- session-variable plumbing is needed.
create or replace function log_billing_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE') then
    insert into billing_rows_history(row_id, action, actor, campaign, old_data, new_data)
      values (OLD.id, 'delete', OLD.updated_by, OLD.campaign_name, to_jsonb(OLD), null);
    return OLD;
  elsif (tg_op = 'UPDATE') then
    -- Ignore pure bookkeeping churn: if nothing but updated_at/updated_by changed,
    -- don't record a history row (e.g. the touch-before-delete, or a no-op commit).
    if (to_jsonb(OLD) - 'updated_at' - 'updated_by') = (to_jsonb(NEW) - 'updated_at' - 'updated_by') then
      return NEW;
    end if;
    insert into billing_rows_history(row_id, action, actor, campaign, old_data, new_data)
      values (NEW.id, 'update', NEW.updated_by, NEW.campaign_name, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  else  -- INSERT
    insert into billing_rows_history(row_id, action, actor, campaign, old_data, new_data)
      values (NEW.id, 'insert', NEW.updated_by, NEW.campaign_name, null, to_jsonb(NEW));
    return NEW;
  end if;
end;
$$;

drop trigger if exists billing_rows_audit on billing_rows;
create trigger billing_rows_audit
  after insert or update or delete on billing_rows
  for each row execute function log_billing_change();

-- History is read-only to the app; only the trigger writes it (and the trigger's
-- SECURITY DEFINER owner bypasses these policies). Authenticated can read; anon
-- gets nothing, same posture as billing_rows.
alter table billing_rows_history enable row level security;
create policy "auth read history" on billing_rows_history for select to authenticated using (true);
grant select on billing_rows_history to authenticated;
revoke all on billing_rows_history from anon;
