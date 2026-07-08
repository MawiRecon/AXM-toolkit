# AXM Toolkit

A single hub for Ax Media's internal web tools. A persistent collapsible
sidebar switches between tools; each tool stays a self-contained page loaded
in an isolated frame, so tools never interfere with one another and new ones
drop in cleanly.

## Structure

```
AXM-toolkit/
├── index.html   ← shell: sidebar + top bar + tool frame
├── theme.css    ← ONE source of truth for the warm-dark palette (shell + all tools)
├── shell.js     ← tool registry + hash routing
└── tools/
    ├── io-autofiller/    ← fills media Insertion Orders from WorkForms (PDF.js, jsPDF)
    └── primary-tracker/  ← 2026 primary calendar w/ urgency alerts (Supabase-backed)
```

## Adding a new tool

1. Create `tools/<your-tool>/index.html` (a self-contained page).
2. Add `<link rel="stylesheet" href="../../theme.css">` in its `<head>` and use
   the shared CSS variables (`--bg`, `--panel`, `--accent`, `--ink`, …) for colors.
3. Add one entry to the `TOOLS` array in [`shell.js`](shell.js) (id, name, desc, src, icon).

That's it — the sidebar link and routing appear automatically.

## Running locally

It must be served over HTTP (the tools use relative paths + Supabase), not opened
as a `file://`. From this folder:

```
python -m http.server 8777
```

then open http://localhost:8777

## Deployment

Static — GitHub Pages from the repo root. Same as the original tools.

## Notes

- `theme.css` aliases both tools' original variable names to the warm palette, so
  each tool's stylesheet was left intact except for deleting its local `:root`.
- The Primary Tracker's Supabase anon key (in `tools/primary-tracker/config.js`) is
  safe to commit — access is governed by Row Level Security, not the key.
