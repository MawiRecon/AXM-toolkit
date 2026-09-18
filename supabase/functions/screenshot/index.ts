// Supabase Edge Function: screenshot
// -----------------------------------------------------------------------------
// Proxies ScreenshotOne so the AXM Mockup Studio can turn a URL into a PNG
// without exposing the ScreenshotOne key in the (public) toolkit repo.
//
// The key is read ONLY from an Edge Function secret. Set it once:
//   Supabase dashboard > Project Settings > Edge Functions > Secrets
//   name: SCREENSHOTONE_ACCESS_KEY   value: <your ScreenshotOne access key>
// (or, with the CLI:  supabase secrets set SCREENSHOTONE_ACCESS_KEY=...)
//
// Deployed with verify_jwt=false; a shared PROXY_TOKEN header is the gate. That
// token is public (it also ships in the tool's config.js), so it only deters
// drive-by abuse of the monthly quota — it is not a real secret.
// -----------------------------------------------------------------------------
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Trim whitespace/newlines and strip any surrounding quotes that can sneak in
// when pasting the value into the dashboard secret field.
const ACCESS_KEY = (Deno.env.get("SCREENSHOTONE_ACCESS_KEY") ?? "").trim().replace(/^["']|["']$/g, "");
const PROXY_TOKEN = "axm-mock-7Qk29fL0pZ";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-mockup-key, authorization, apikey",
};

const DEVICES: Record<string, { w: number; h: number; dsf: number; mobile: boolean }> = {
  laptop: { w: 1440, h: 900, dsf: 1, mobile: false },
  tablet: { w: 820, h: 1180, dsf: 2, mobile: true },
  iphone: { w: 390, h: 844, dsf: 3, mobile: true },
};

function json(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  try {
    if (req.headers.get("x-mockup-key") !== PROXY_TOKEN) {
      return json(401, { error: "unauthorized" });
    }
    if (!ACCESS_KEY) {
      return json(503, { error: "Screenshot service not configured (missing SCREENSHOTONE_ACCESS_KEY secret)." });
    }
    const body = await req.json().catch(() => ({}));
    const url = String(body.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return json(400, { error: "Provide a full http(s) URL" });
    }
    const dev = DEVICES[body.device as string] ?? DEVICES.laptop;

    const p = new URLSearchParams();
    p.set("access_key", ACCESS_KEY);
    p.set("url", url);
    p.set("format", "png");
    p.set("viewport_width", String(dev.w));
    p.set("viewport_height", String(dev.h));
    p.set("device_scale_factor", String(dev.dsf));
    if (dev.mobile) {
      p.set("viewport_mobile", "true");
      p.set("viewport_has_touch", "true");
    }
    p.set("full_page", body.fullPage ? "true" : "false");
    p.set("block_cookie_banners", body.blockCookies === false ? "false" : "true");
    p.set("block_ads", body.blockAds ? "true" : "false");
    p.set("block_chats", "true");
    p.set("cache", "true");
    p.set("cache_ttl", "2592000");
    // networkidle2 (near-idle) instead of networkidle0 (fully idle): ad/tracker-heavy
    // news sites never go fully idle, which would crawl to the timeout.
    p.set("wait_until", "networkidle2");
    // Full-page captures of large sites render slowly — give them more headroom.
    p.set("timeout", body.fullPage ? "60" : "30");

    const r = await fetch("https://api.screenshotone.com/take?" + p.toString());
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return json(r.status, { error: "Screenshot service error", detail: txt.slice(0, 600) });
    }
    const buf = await r.arrayBuffer();
    return new Response(buf, {
      headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return json(500, { error: String(e) });
  }
});
