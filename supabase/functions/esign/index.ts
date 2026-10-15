// Supabase Edge Function: esign
// -----------------------------------------------------------------------------
// Back end for the AXM E-Sign tool (tools/esign/) and its public signing page
// (tools/esign/sign.html). A "PandaDoc lite": no cryptographic sealing, just a
// stamped signature, a date, and a plain audit page appended to the PDF.
//
// Flow
//   1. create  — the toolkit uploads an IO PDF + the Grapeseed signer's email.
//                We stamp that signer's saved signature + date on the Grapeseed
//                line right away, store the draft, and return a signing token.
//   2. view    — the client opens sign.html#t=<token>; we hand back a short-lived
//                URL for the draft and where their signature goes.
//   3. sign    — we stamp the client's signature + date, append the audit page,
//                store the executed PDF, then (if a Monday item is linked) attach
//                it to "Signed IO" and flip IO Status to "IO Fully Executed".
//
// Secrets (Supabase dashboard > Project Settings > Edge Functions > Secrets):
//   MONDAY_API_TOKEN  — a Monday API token with write access to the Contracts
//                       board. Without it, signing still works; the Monday step
//                       is recorded as "skipped" and can be retried from the tool.
//
// Deployed with verify_jwt=false. Internal actions are gated by TOOL_KEY, which
// also ships in tools/esign/config.js — the repo is public, so it is a deterrent,
// not a secret. Public actions (view/sign) are gated by the per-request token.
// The tables and the `esign` bucket have RLS on with no policies, so the anon
// key alone can read nothing.
// -----------------------------------------------------------------------------
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const TOOL_KEY = "axm-esign-i-fCgmYHmMXF";
const BUCKET = "esign";
const MONDAY_BOARD = 2223139498;          // 📁 Contracts
const MONDAY_FILE_COL = "files7";         // Signed IO
const MONDAY_STATUS_COL = "status9";      // IO Status
const MONDAY_EXECUTED = "IO Fully Executed";
// Flipping IO Status to "IO Fully Executed" fires the board's own automations —
// IO Executed Date, Contract Status → "IO Executed", and the Make webhook that
// feeds the Invoice Tracker — exactly as when someone clicks it by hand. The file
// is attached FIRST so anything downstream already sees the signed IO.
const MONDAY_TOKEN = (Deno.env.get("MONDAY_API_TOKEN") ?? "").trim().replace(/^["']|["']$/g, "");

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-esign-key, authorization, apikey",
};

function json(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}
const fail = (status: number, msg: string): never => { throw new HttpError(status, msg); };

type Box = { x: number; y: number; w: number; h: number };
type Fields = { page: number; gsmSig: Box; gsmDate: Box; clientSig: Box; clientDate: Box };

// ---------- helpers ----------
const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0));
const randToken = () => {
  const a = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const isBox = (b: any): b is Box => b && ["x", "y", "w", "h"].every((k) => Number.isFinite(b[k]));
const cleanDate = (s: unknown) => {
  const v = String(s ?? "").trim();
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) fail(400, "Bad date");
  return v;
};
const pngOnly = (s: unknown) => {
  const v = String(s ?? "");
  if (!v.startsWith("data:image/png;base64,") || v.length > 2_000_000) fail(400, "Signature must be a PNG");
  return v;
};

async function download(path: string): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) fail(500, "Could not read stored PDF");
  return new Uint8Array(await data!.arrayBuffer());
}
async function upload(path: string, bytes: Uint8Array) {
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) fail(500, "Could not store PDF: " + error.message);
}
const signedName = (row: any) => (row.file_name || "IO.pdf").replace(/\.pdf$/i, "") + "_signed.pdf";
async function signedUrl(path: string, downloadName?: string) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 3600, downloadName ? { download: downloadName } : undefined);
  if (error || !data) fail(500, "Could not sign URL");
  return data!.signedUrl;
}

/* Draw a signature PNG into a box (fit, bottom-left aligned so it sits on the
   line) and the date into its box. Boxes are PDF points with a TOP-LEFT origin
   (what the browser placer works in); pdf-lib wants bottom-left. */
async function stamp(pdf: PDFDocument, f: Fields, sig: Box, date: Box, png: string, dateText: string) {
  const page = pdf.getPage(Math.min(Math.max(f.page | 0, 0), pdf.getPageCount() - 1));
  const H = page.getHeight();
  const img = await pdf.embedPng(b64ToBytes(png));
  const s = Math.min(sig.w / img.width, sig.h / img.height);
  const w = img.width * s, h = img.height * s;
  page.drawImage(img, { x: sig.x, y: H - sig.y - sig.h, width: w, height: h });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = Math.min(10, date.h * 0.8);
  page.drawText(dateText, { x: date.x + 2, y: H - date.y - date.h + 3, size, font, color: rgb(0, 0, 0) });
}

async function auditPage(pdf: PDFDocument, row: any) {
  const first = pdf.getPage(0);
  const page = pdf.addPage([first.getWidth(), first.getHeight()]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = page.getHeight() - 60;
  const maxW = page.getWidth() - 240;
  const line = (label: string, value: string) => {
    // Standard fonts are WinAnsi-only; anything else (emoji, CJK) would throw.
    let v = (value || "—").replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/g, "?");
    // one line per field: trim to fit rather than wrap
    while (v.length > 1 && font.widthOfTextAtSize(v, 10) > maxW) v = v.slice(0, -2) + "…";
    page.drawText(label, { x: 50, y, size: 10, font: bold });
    page.drawText(v, { x: 190, y, size: 10, font });
    y -= 18;
  };
  page.drawText("Signature Record", { x: 50, y, size: 16, font: bold }); y -= 30;
  line("Document", row.title || row.file_name || "");
  line("Reference", row.id);
  y -= 10;
  page.drawText("Grapeseed Media", { x: 50, y, size: 12, font: bold }); y -= 20;
  line("Signer", `${row.gsm_name || ""} <${row.gsm_email}>`);
  line("Signed (UTC)", new Date(row.gsm_signed_at).toISOString().replace("T", " ").slice(0, 19));
  y -= 10;
  page.drawText("Client", { x: 50, y, size: 12, font: bold }); y -= 20;
  line("Signer", row.signer_name + (row.client_email ? ` <${row.client_email}>` : ""));
  line("Signed (UTC)", new Date(row.signed_at).toISOString().replace("T", " ").slice(0, 19));
  line("IP address", row.signer_ip || "");
  line("Browser", row.signer_ua || "");
  y -= 14;
  page.drawText("The client consented to sign this document electronically.", { x: 50, y, size: 9, font, color: rgb(0.3, 0.3, 0.3) });
}

async function pushMonday(row: any, bytes: Uint8Array): Promise<{ monday_status: string; monday_error: string | null }> {
  if (!row.monday_item_id) return { monday_status: "skipped", monday_error: "No Monday item linked" };
  if (!/^\d+$/.test(row.monday_item_id)) return { monday_status: "error", monday_error: "Monday item id is not numeric" };
  if (!MONDAY_TOKEN) return { monday_status: "skipped", monday_error: "MONDAY_API_TOKEN secret not set" };
  const headers = { Authorization: MONDAY_TOKEN, "API-Version": "2024-10" };
  try {
    const form = new FormData();
    form.append("query", `mutation ($file: File!) { add_file_to_column (item_id: ${row.monday_item_id}, column_id: "${MONDAY_FILE_COL}", file: $file) { id } }`);
    form.append("variables[file]", new Blob([bytes], { type: "application/pdf" }), signedName(row));
    const up = await fetch("https://api.monday.com/v2/file", { method: "POST", headers, body: form });
    const upJ = await up.json().catch(() => ({}));
    if (!up.ok || upJ.errors || upJ.error_message) throw new Error("File upload: " + JSON.stringify(upJ.errors || upJ.error_message || up.status));

    const q = `mutation ($v: JSON!) { change_column_value (board_id: ${MONDAY_BOARD}, item_id: ${row.monday_item_id}, column_id: "${MONDAY_STATUS_COL}", value: $v) { id } }`;
    const st = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, variables: { v: JSON.stringify({ label: MONDAY_EXECUTED }) } }),
    });
    const stJ = await st.json().catch(() => ({}));
    if (!st.ok || stJ.errors || stJ.error_message) throw new Error("Signed IO attached, but IO Status update failed: " + JSON.stringify(stJ.errors || stJ.error_message || st.status));
    return { monday_status: "done", monday_error: null };
  } catch (e) {
    return { monday_status: "error", monday_error: String((e as Error).message).slice(0, 500) };
  }
}

const LIST_COLS = "id,token,title,file_name,monday_item_id,gsm_email,gsm_name,client_name,client_email,status,viewed_at,signed_at,signer_name,monday_status,monday_error,created_at";

// ---------- actions ----------
const internal: Record<string, (b: any) => Promise<unknown>> = {
  async signer_get(b) {
    const email = String(b.email ?? "").trim().toLowerCase();
    const { data } = await db.from("esign_signers").select("email,name,signature_png").eq("email", email).maybeSingle();
    return { signer: data };
  },
  async signer_save(b) {
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@grapeseedmedia\.com$/i.test(email)) fail(400, "Use an @grapeseedmedia.com email");
    const name = String(b.name ?? "").trim();
    if (!name) fail(400, "Name required");
    const { error } = await db.from("esign_signers").upsert({ email, name, signature_png: pngOnly(b.signature_png), updated_at: new Date().toISOString() });
    if (error) fail(500, error.message);
    return { ok: true };
  },
  async create(b) {
    const email = String(b.gsm_email ?? "").trim().toLowerCase();
    const { data: signer } = await db.from("esign_signers").select("*").eq("email", email).maybeSingle();
    if (!signer) fail(400, "No saved signature for that Grapeseed email");
    const f = b.fields as Fields;
    if (!f || !isBox(f.gsmSig) || !isBox(f.gsmDate) || !isBox(f.clientSig) || !isBox(f.clientDate)) fail(400, "Signature fields missing");
    const bytes = b64ToBytes(String(b.pdf_b64 ?? ""));
    if (bytes.length < 100 || bytes.length > 15_000_000 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") fail(400, "Not a PDF");
    const item = String(b.monday_item_id ?? "").trim();
    if (item && !/^\d+$/.test(item)) fail(400, "Monday item id must be numeric");

    const pdf = await PDFDocument.load(bytes);
    await stamp(pdf, f, f.gsmSig, f.gsmDate, signer.signature_png, cleanDate(b.local_date));
    const out = await pdf.save();

    const id = crypto.randomUUID();
    const draft_path = `drafts/${id}.pdf`;
    await upload(draft_path, out);
    const row = {
      id, token: randToken(), draft_path, fields: f,
      title: String(b.title ?? "").slice(0, 300) || null,
      file_name: String(b.file_name ?? "IO.pdf").slice(0, 200),
      monday_item_id: item || null,
      gsm_email: email, gsm_name: signer.name,
      client_name: String(b.client_name ?? "").trim().slice(0, 200) || null,
      client_email: String(b.client_email ?? "").trim().slice(0, 200) || null,
    };
    const { error } = await db.from("esign_requests").insert(row);
    if (error) fail(500, error.message);
    return { id, token: row.token };
  },
  async list() {
    const { data, error } = await db.from("esign_requests").select(LIST_COLS).order("created_at", { ascending: false }).limit(200);
    if (error) fail(500, error.message);
    return { rows: data };
  },
  async file(b) {
    const { data: row } = await db.from("esign_requests").select("*").eq("id", b.id).maybeSingle();
    if (!row) fail(404, "Not found");
    const path = b.which === "signed" ? row.signed_path : row.draft_path;
    if (!path) fail(404, "Not signed yet");
    return { url: await signedUrl(path, b.which === "signed" ? signedName(row) : row.file_name || "IO.pdf") };
  },
  async void(b) {
    const { error } = await db.from("esign_requests").update({ status: "void" }).eq("id", b.id).neq("status", "signed");
    if (error) fail(500, error.message);
    return { ok: true };
  },
  async monday_retry(b) {
    const { data: row } = await db.from("esign_requests").select("*").eq("id", b.id).maybeSingle();
    if (!row || !row.signed_path) fail(400, "Not signed yet");
    if (b.monday_item_id !== undefined) {
      const item = String(b.monday_item_id ?? "").trim();
      if (item && !/^\d+$/.test(item)) fail(400, "Monday item id must be numeric");
      row.monday_item_id = item || null;
    }
    const res = await pushMonday(row, await download(row.signed_path));
    await db.from("esign_requests").update({ ...res, monday_item_id: row.monday_item_id }).eq("id", row.id);
    return res;
  },
};

async function byToken(token: unknown) {
  const t = String(token ?? "");
  if (t.length < 20) fail(404, "This signing link is not valid.");
  const { data: row } = await db.from("esign_requests").select("*").eq("token", t).maybeSingle();
  if (!row) fail(404, "This signing link is not valid.");
  if (row.status === "void") fail(410, "This document has been withdrawn.");
  return row;
}

const pub: Record<string, (b: any, req: Request) => Promise<unknown>> = {
  async view(b) {
    const row = await byToken(b.token);
    if (row.status === "sent") {
      await db.from("esign_requests").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", row.id).eq("status", "sent");
    }
    const signed = row.status === "signed";
    return {
      status: signed ? "signed" : "open",
      title: row.title,
      client_name: row.client_name,
      url: signed ? await signedUrl(row.signed_path, signedName(row)) : await signedUrl(row.draft_path),
      page: row.fields.page | 0,
      clientSig: row.fields.clientSig,
      clientDate: row.fields.clientDate,
    };
  },
  async sign(b, req) {
    const row = await byToken(b.token);
    if (row.status === "signed") fail(409, "This document has already been signed.");
    if (b.consent !== true) fail(400, "Consent required");
    const name = String(b.name ?? "").trim().slice(0, 200);
    if (!name) fail(400, "Please enter your full name");
    const png = pngOnly(b.signature_png);
    const dateText = cleanDate(b.local_date);

    const now = new Date().toISOString();
    Object.assign(row, {
      signer_name: name, signed_at: now,
      signer_ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
      signer_ua: (req.headers.get("user-agent") ?? "").slice(0, 400),
    });
    const pdf = await PDFDocument.load(await download(row.draft_path));
    await stamp(pdf, row.fields, row.fields.clientSig, row.fields.clientDate, png, dateText);
    await auditPage(pdf, row);
    const out = await pdf.save();
    const signed_path = `signed/${row.id}.pdf`;
    await upload(signed_path, out); // upsert:false — a double submit fails here

    const { data: claimed, error } = await db.from("esign_requests")
      .update({ status: "signed", signed_at: now, signer_name: name, signer_ip: row.signer_ip, signer_ua: row.signer_ua, signed_path, monday_status: "pending" })
      .eq("id", row.id).neq("status", "signed").neq("status", "void").select("id");
    if (error || !claimed?.length) fail(409, "This document has already been signed.");

    const res = await pushMonday(row, out);
    await db.from("esign_requests").update(res).eq("id", row.id);
    return { ok: true, url: await signedUrl(signed_path, signedName(row)) };
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    if (pub[action]) return json(200, await pub[action](body, req));
    if (internal[action]) {
      if (req.headers.get("x-esign-key") !== TOOL_KEY) return json(401, { error: "unauthorized" });
      return json(200, await internal[action](body));
    }
    return json(400, { error: "Unknown action" });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: "Server error: " + String((e as Error).message ?? e) });
  }
});
