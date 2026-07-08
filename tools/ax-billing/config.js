// Ax Billing Tracker — configuration
// ---------------------------------------------------------------
// BACKEND:
//   'local'    -> data lives in this browser's localStorage. Used for
//                 local testing. No login, no cloud. Each browser is
//                 its own island — NOT shared.
//   'supabase' -> data lives in Supabase behind a shared login. This is
//                 the real, shared source of truth. Flip to this AFTER
//                 running schema.sql and creating the shared user
//                 (see schema.sql header).
//
// The anon key is safe to expose — the billing table's RLS grants nothing
// to anon; only the authenticated shared session can read/write it.
// ---------------------------------------------------------------
window.AX_BILLING_CONFIG = {
  BACKEND: 'supabase',

  // used only when BACKEND === 'supabase'
  SUPABASE_URL:  'https://joojunnbkzebulolnliq.supabase.co',
  SUPABASE_ANON: 'sb_publishable_dRnf7zrlychnOyJ_mli1ZA_BtJw3Aqh',
  SHARED_EMAIL:  'mason.widmer@grapeseedmedia.com'
};
