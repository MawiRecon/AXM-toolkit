-- =====================================================================
-- AXM E-Sign — Supabase schema (shared joojunn project)
-- ---------------------------------------------------------------------
-- Trust model: unlike the other toolkit tables, NOTHING here is readable
-- with the public anon key. RLS is on with no policies, and the storage
-- bucket is private. Every read/write goes through the `esign` edge
-- function (service role), which gates:
--   * internal actions (create / list / signer profiles) on a shared
--     toolkit token — public in this repo, so a deterrent only;
--   * the client signing page on the per-request random token in the link.
-- =====================================================================

-- Grapeseed signers. Their saved signature is applied automatically to the
-- "Grapeseed Media Authorized Signature" line, keyed by the email entered.
create table if not exists esign_signers (
  email          text primary key check (email ~* '^[^@\s]+@grapeseedmedia\.com$'),
  name           text not null,
  signature_png  text not null,            -- data:image/png;base64,...
  updated_at     timestamptz not null default now()
);

create table if not exists esign_requests (
  id              uuid primary key default gen_random_uuid(),
  token           text not null unique,     -- client signing link token
  title           text,
  file_name       text,
  monday_item_id  text,
  gsm_email       text not null references esign_signers(email),
  gsm_name        text,
  gsm_signed_at   timestamptz not null default now(),
  client_name     text,                     -- optional, for the record
  client_email    text,
  fields          jsonb not null,           -- {page, gsmSig, gsmDate, clientSig, clientDate}: PDF pts, top-left origin
  status          text not null default 'sent' check (status in ('sent','viewed','signed','void')),
  viewed_at       timestamptz,
  signed_at       timestamptz,
  signer_name     text,
  signer_ip       text,
  signer_ua       text,
  draft_path      text not null,            -- Grapeseed-signed PDF awaiting the client
  signed_path     text,                     -- fully executed PDF
  monday_status   text check (monday_status in ('pending','done','error','skipped')),
  monday_error    text,
  created_at      timestamptz not null default now()
);
create index if not exists esign_requests_created_idx on esign_requests (created_at desc);

alter table esign_signers  enable row level security;
alter table esign_requests enable row level security;

insert into storage.buckets (id, name, public)
values ('esign', 'esign', false)
on conflict (id) do nothing;
