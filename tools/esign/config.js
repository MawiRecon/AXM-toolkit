// AXM E-Sign — config
// ---------------------------------------------------------------
// Everything goes through the `esign` edge function (shared joojunn
// project). The tables and the `esign` storage bucket are NOT readable
// with the anon key — see schema.sql for the trust model.
// TOOL_KEY matches the function; the repo is public, so it only deters
// drive-by use of the internal actions — it is not a real secret.
// ---------------------------------------------------------------
window.AX_ESIGN_CONFIG = {
  FN:       'https://joojunnbkzebulolnliq.supabase.co/functions/v1/esign',
  TOOL_KEY: 'axm-esign-i-fCgmYHmMXF'
};
