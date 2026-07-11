// Shared Supabase helpers (Postgres via PostgREST + Storage) for the order
// and delivery APIs. Uses the service key, so these run server-side only.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export function supabaseReady() {
  return Boolean(SUPABASE_URL && SERVICE_KEY);
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function getOrder(id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: headers() });
  if (!r.ok) throw new Error(`getOrder ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

// List orders, newest first, optionally excluding a status (e.g. 'delivered').
export async function listOrders({ excludeStatus } = {}) {
  let url = `${SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc`;
  if (excludeStatus) url += `&status=neq.${encodeURIComponent(excludeStatus)}`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`listOrders ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function updateOrder(id, patch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`updateOrder ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows[0] || null;
}

// Create a signed upload URL so the browser can upload the MP3 directly to
// Storage (keeps large files off the serverless function's small body limit).
export async function createSignedUpload(bucket, path) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({}),
  });
  if (!r.ok) throw new Error(`createSignedUpload ${r.status}: ${await r.text()}`);
  const data = await r.json(); // { url: "/object/upload/sign/<bucket>/<path>?token=..." }
  return {
    uploadUrl: `${SUPABASE_URL}/storage/v1${data.url}`,
    publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`,
  };
}

export { SUPABASE_URL };
