// Ax Mockup Studio — config
// ---------------------------------------------------------------
// Shares the AXM Supabase project (joojunn) with the other tools.
//  - Publisher logo library  -> table `mockup_logos` + bucket `mockup-logos`
//  - Per-device screen-area calibration -> table `mockup_frames`
//  - Webpage capture          -> edge function `screenshot` (proxies ScreenshotOne;
//                                the ScreenshotOne key is a server-side secret,
//                                never shipped in this repo).
// The anon/publishable key is safe to expose — access is governed by RLS.
// ---------------------------------------------------------------
window.AX_MOCKUP_CONFIG = {
  SUPABASE_URL:  'https://joojunnbkzebulolnliq.supabase.co',
  SUPABASE_ANON: 'sb_publishable_dRnf7zrlychnOyJ_mli1ZA_BtJw3Aqh',
  SCREENSHOT_FN: 'https://joojunnbkzebulolnliq.supabase.co/functions/v1/screenshot',
  // Public gate token (matches the edge function). Only deters drive-by abuse
  // of the shared screenshot quota — not a real secret.
  PROXY_TOKEN:   'axm-mock-7Qk29fL0pZ'
};
