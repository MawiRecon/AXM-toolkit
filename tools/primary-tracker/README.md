# AxMedia Primary Tracker

Personal dashboard for tracking the 2026 primary calendar with urgency-based flagging tied to flighting and optimization windows. Surfaces upcoming primaries for client candidates and color-codes them by how close the race is. Roster is shared across all users via Supabase — anyone with the URL can view and edit, with changes syncing in real time.

## Live tracker

Hosted via GitHub Pages. Open `index.html` directly for solo offline use, or visit the published Pages URL for the live shared experience.

## Project layout

```
.
├── index.html                          # the entire app (HTML + CSS + JS in one file)
├── config.js                           # Supabase URL + anon key (commit this)
├── supabase-setup.sql                  # canonical fresh-install schema
├── migration-001-edits-and-runoffs.sql # upgrade for an existing v1 project
├── migration-002-slack-webhook.sql     # adds per-client Slack webhook column
├── migration-003-per-client-runoffs.sql # moves runoffs to per-client roster columns
└── README.md
```

## Urgency tiers

| Tier | Window | Treatment |
|------|--------|-----------|
| INCREASE IMPRESSIONS | ≤11 days | Red flashing badge + top-of-page alert listing every client in the ramp window |
| Urgent · GOTV | 12–14 days | Red badge |
| Gain Steam | 15–30 days | Orange badge |
| Saturation | 31–60 days | Yellow badge |
| Awareness | 60+ days | Neutral badge |

The INCREASE IMPRESSIONS window covers the entire 11-days-or-fewer stretch — once a client's election crosses that threshold, the badge stays flashing and the top-of-page alert keeps listing them through to election day.

## Roster columns

Each row on the client roster panel shows:
- **Tier** — urgency badge based on days-until the next upcoming election in the state (primary or confirmed runoff). Roster rows tagged with a small `runoff` badge when the next election is a runoff.
- **Date / Day** — the next election date for that state.
- **Candidate** — the name (with `auto`/`manual` source tag).
- **Race** — `{State} · {Office} [· {District}]`. Editable via the Edit button.
- **Custom Notes** — per-client annotation. Editable via the Edit button; useful for buy details, optimization decisions, internal context. (The full NBC race notes still appear in the bottom Calendar table.)

## Slack reminders (per-client)

When a client crosses into the INCREASE IMPRESSIONS window (≤11 days out), a `📤 Slack` button appears on that row. Clicking it POSTs a single-client reminder to a Slack channel — formatted with the candidate name, race, election date, days-out countdown, and any Custom Notes.

Each client has its own webhook URL (typically tied to a per-client Slack channel). To wire one up:

1. In Slack, go to https://api.slack.com/apps → **Create New App** → **From scratch** → name and pick your workspace.
2. In the new app, **Incoming Webhooks** → toggle **On** → **Add New Webhook to Workspace** → pick the channel → copy the URL it generates.
3. On the dashboard, click **Edit** on the client (or paste the URL when first manually assigning the candidate). Paste the webhook URL into the "Slack webhook URL" field. Save.
4. Once a client crosses ≤11 days out, the row's `📤 Slack` button is armed. Click → reminder fires.

Rows in the ramp window without a webhook show a muted **Set Slack URL** button — clicking it opens the Edit modal with the Slack field focused.

The webhook URL is stored on the client's roster row in Supabase (column `slack_webhook_url`). It is not committed to Git, but it is readable by anyone who can hit the live page (same exposure model as the rest of the roster). Slack incoming webhook URLs are scoped to one channel and trivial to rotate from the Slack admin if leaked.

## Runoffs

Runoffs are tracked **per client**. When a candidate is confirmed to be in a runoff, click **Edit** on that client's roster row and set the **Runoff date** field. While set, that client's countdown targets the runoff date instead of the state's primary date — and only that client is affected. Other clients in the same state continue counting down to the primary.

Clear the Runoff date to revert to the primary countdown.

## How the shared roster works

The roster lives in a `roster` table in Supabase. The page connects on load, fetches the current roster, and subscribes to realtime changes. When anyone adds, removes, or edits a candidate, every other open browser updates within a second or two. Runoffs in the `events` table sync the same way.

If the browser can't reach Supabase (offline, project paused, etc.), the page falls back to a localStorage cache so it still renders something useful. Adds/removes are blocked until the connection returns.

The status line under the action buttons shows connection state:
- Green (●) — Live · syncing across all browsers
- Orange (●) — Offline / misconfigured / showing cached roster

## First-time setup

### 1. Create the Supabase backend

1. Sign in at [supabase.com](https://supabase.com) (link with GitHub if not already)
2. New Project → name it whatever, pick a region close to you
3. Once provisioned, open **SQL Editor** → **New query**
4. Paste the contents of `supabase-setup.sql` and run it
5. Open **Settings → API**, copy the **Project URL** and **anon / public key**

### Upgrading an existing project

Run the contents of any `migration-*.sql` files you haven't applied yet, in order, in the Supabase SQL Editor. All migrations are idempotent — safe to run more than once.

- `migration-001-edits-and-runoffs.sql` — adds Custom Notes, the events table (no longer used by the page after migration 003), and the roster UPDATE policy
- `migration-002-slack-webhook.sql` — adds the per-client Slack webhook column
- `migration-003-per-client-runoffs.sql` — moves runoffs to per-client roster columns (replaces the state-wide events approach)

### 2. Configure the page

Open `config.js` and replace the two placeholders:

```js
window.SUPABASE_CONFIG = {
  url:     'https://YOUR-PROJECT-REF.supabase.co',
  anonKey: 'eyJhbGc...'
};
```

The anon key is meant to be public — Supabase Row Level Security policies (set up by `supabase-setup.sql`) control what it can actually do. Commit `config.js` to the repo.

### 3. Deploy

Push the repo to GitHub. Settings → Pages → Source: `main` branch, root → published at `https://<username>.github.io/<repo>/`.

## Updating the calendar

The 2026 primary calendar is hardcoded as a `PRIMARIES` array near the top of the `<script>` block in `index.html`. Each entry:

```js
{
  date: '2026-06-02',
  state: 'California',
  offices: ['Governor', 'U.S. House', 'State Legislature'],
  notes: 'Open governor (Newsom term-limited). Top-two jungle primary.',
  candidates: ['Katie Porter', 'Antonio Villaraigosa']  // names NBC flagged
}
```

When NBC updates the calendar mid-cycle (rare), edit this array directly. For the 2027 off-year or 2028 cycle, replace it wholesale.

## Local development

No build step. Open `index.html` directly in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

The Supabase fetch works either way (it's a CDN call, not a same-origin file fetch).

## Backups

The **Backup JSON** button downloads a snapshot of the current roster as `roster-backup-YYYY-MM-DD.json`. Useful before doing anything risky, or for archiving cycle-end state. Backup files are gitignored by default — drop them somewhere outside the repo or commit explicitly if you want them tracked.

## Tightening access later

If "anyone with the URL can edit" stops being acceptable, tighten the RLS policies in Supabase:

```sql
-- Drop public-write policies
drop policy "Public insert" on roster;
drop policy "Public delete" on roster;

-- Replace with auth-gated equivalents (requires sign-in flow in the page)
create policy "Auth insert" on roster for insert to authenticated with check (true);
create policy "Auth delete" on roster for delete to authenticated using (true);
```

Auth UI in the page is a separate change — flag me when you want it.

## Testing tier transitions

Append `?today=YYYY-MM-DD` to the URL to override the date used for tier calculations. Useful for verifying that the 11-day INCREASE IMPRESSIONS flag fires correctly without changing the system clock.

```
index.html?today=2026-06-09
```

## Out of scope (v1)

No Monday.com, PipeDrive, or Grapeseed data integration. No budget or IO metadata. No filters/search. No mobile layout. No auth — anyone with the URL can edit.
