# Ax Billing Tracker

A spreadsheet-style web version of the `NEW_2026_Master_Billing` tab — the
source of truth for Ax campaign billing and rebate math. Add/edit rows exactly
like Sheets, or seed a row straight from the IO Tool. The rebate math is ported
1:1 from the Sheet and parity-tested against all 286 rows.

## Files

```
tools/ax-billing/
├── index.html   ← the page: grid, inline editing, login gate, import/export, IO handoff
├── rebate.js    ← the billing math — the ONLY place formulas live (parity-tested)
├── store.js     ← data layer: LocalStore (testing) + SupabaseStore (shared, real)
├── config.js    ← BACKEND switch + Supabase creds (anon key safe to commit)
├── schema.sql   ← Supabase table + authenticated-only RLS + setup steps
└── data/         ← git-ignored; holds seed.local.json (real billing data, never committed)
```

## The rebate math (`rebate.js`)

| Col | Field | Formula |
|-----|-------|---------|
| B | End Month | month name of Campaign End |
| J | Delta | IO Amount − Actualized Spend |
| L | Invoice Rebate Value | Rebate % × Actualized Spend |
| M | Sent to Grapeseed | Actualized Spend − (Spend × Rebate %) |
| O | Gross Profit | Actualized Spend × Actualized Margin |
| P | Total Back-End Rebate | (Gross Profit ÷ 2) − Invoice Rebate Value |
| Q | Difference Owed | Total Back-End Rebate − Previous Back-End |

`B, J, L, M, O` are read-only. `P` and `Q` show the computed value but are
**editable** — type a value to override the formula (matches the Sheet, where
these are frequently hand-set); **clear the cell** to revert to the formula.
An overridden cell shows an orange dot.

**Parity:** 1148/1148 computed cells match the Sheet to the penny. The only
intentional divergence: on rows where Margin isn't entered yet, this tool shows
a blank instead of the Sheet's placeholder `0` gross / negative rebate.

## Two backends

`config.js` → `BACKEND`:

- **`local`** — data in this browser's localStorage. For local testing. No login.
  Use the **Import 2026** button to load `data/seed.local.json`.
- **`supabase`** — the shared source of truth. Data lives in Supabase behind a
  single shared login (the shared password = the passphrase). Flip to this after:
  1. Run `schema.sql` in the Supabase SQL Editor.
  2. Enable Email auth (disable "Confirm email") and add one shared user.
  3. Set `BACKEND:'supabase'` and `SHARED_EMAIL` in `config.js`.

The billing table's RLS grants access only to an authenticated session, so the
public anon key exposes nothing without the shared login.

## IO Tool → Billing handoff

The IO Tool's **Send to Billing** button pushes the refined IO fields (entity,
advertiser, campaign, IO amount, flight dates) onto a same-origin localStorage
inbox. The Billing Tracker drains it and creates a pre-filled row — Column A is
composed as `Entity | Advertiser | Campaign | Flight Start`. You fill the
actuals (spend, margin, invoice #) later as the campaign runs.

## Local run

From the repo root: `python -m http.server 8777` → open
`http://localhost:8777/#ax-billing`.
