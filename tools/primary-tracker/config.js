// Supabase connection config
// ---------------------------------------------------------------
// Both values come from your Supabase project: Settings > API
// The anon key is SAFE to commit and expose in client code -
// access is controlled by Row Level Security policies, not the key.
//
// To rotate or swap projects, just edit these two strings.
//
// Points at the SHARED AXM Supabase project (joojunnbkzebulolnliq) — the same
// project used by the IO Autofiller, L2 Audience, and Billing tools. The roster
// table + its anon RLS policies live there (migrated from the old standalone
// project mnjyhtqzgshyyyoedlhe on 2026-07-14).
// ---------------------------------------------------------------
window.SUPABASE_CONFIG = {
  url:     'https://joojunnbkzebulolnliq.supabase.co',
  anonKey: 'sb_publishable_dRnf7zrlychnOyJ_mli1ZA_BtJw3Aqh'
};
