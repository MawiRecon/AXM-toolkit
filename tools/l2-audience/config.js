// Ax L2 Audience Builder — Supabase config
// ---------------------------------------------------------------
// Job queue + history table (`audience_jobs`) lives in the SAME Supabase
// project as io_history / billing_rows. Anon-accessible (no login gate on
// this tool) — see schema.sql "TRUST MODEL". The browser only ever writes
// job requests and reads status; NO L2 credential ever touches this table
// (the local worker holds the L2 session on-device).
// ---------------------------------------------------------------
window.AX_L2_CONFIG = {
  SUPABASE_URL:  'https://joojunnbkzebulolnliq.supabase.co',
  SUPABASE_ANON: 'sb_publishable_dRnf7zrlychnOyJ_mli1ZA_BtJw3Aqh'
};
