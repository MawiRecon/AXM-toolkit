// Ax IO Autofiller — Supabase config
// ---------------------------------------------------------------
// History table (`io_history`) lives in the SAME Supabase project as
// ax-billing. Different table, different auth model — see schema.sql
// for the trust-model notes (io_history is anon-accessible; no login
// gate on this tool).
// ---------------------------------------------------------------
window.AX_IO_CONFIG = {
  SUPABASE_URL:  'https://joojunnbkzebulolnliq.supabase.co',
  SUPABASE_ANON: 'sb_publishable_dRnf7zrlychnOyJ_mli1ZA_BtJw3Aqh'
};
