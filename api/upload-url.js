// Returns a short-lived signed URL so the browser can upload the finished MP3
// straight to Supabase Storage (bypasses the serverless body-size limit).
import { createSignedUpload, supabaseReady } from '../lib/db.js';
import { adminAuthed } from '../lib/auth.js';

// Customer CD cover photos. This branch is PUBLIC — the photo is chosen before
// checkout, so there is no order and no credential to check yet. It stays safe
// by being narrow, and must never be widened to the songs bucket:
//   * writes only to COVERS_BUCKET, nowhere near customer masters
//   * image extensions only, and the bucket itself enforces an image-only MIME
//     allowlist and a size cap, so a forged request still cannot store anything
//     other than a reasonably sized image
//   * the filename is generated here; nothing the caller sends reaches the path
const COVER_EXTS = { jpg: 'jpg', jpeg: 'jpg', png: 'png', heic: 'heic', webp: 'webp' };

async function coverUpload(req, res) {
  const e = COVER_EXTS[String((req.body || {}).ext || '').toLowerCase().replace(/^\./, '')];
  if (!e) return res.status(400).json({ error: 'Please upload a JPG, PNG, HEIC or WEBP image.' });
  const rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const bucket = process.env.COVERS_BUCKET || 'Covers';
  const { uploadUrl, publicUrl } = await createSignedUpload(bucket, `cover-${rand}.${e}`);
  return res.status(200).json({ uploadUrl, publicUrl });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!supabaseReady()) return res.status(500).json({ error: 'Storage not configured' });

  // Public branch, before the admin gate. Deliberately cannot reach the songs bucket.
  if ((req.body || {}).cover) {
    try { return await coverUpload(req, res); }
    catch (err) { console.error('cover upload-url failed:', err); return res.status(500).json({ error: 'Could not prepare the upload.' }); }
  }

  if (!adminAuthed(req)) return res.status(401).json({ error: 'Wrong password' });
  if (!supabaseReady()) return res.status(500).json({ error: 'Database not configured' });
  try {
    const { orderId, kind, ext } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    // kind is a label (mp3 / wav / multitrack / remastered); ext is the real
    // file extension, so a remastered track can be either wav or mp3.
    const KINDS = ['mp3', 'wav', 'zip', 'multitrack', 'remastered'];
    const EXTS = ['mp3', 'wav', 'zip'];
    const k = KINDS.includes(kind) ? kind : 'mp3';
    const e = EXTS.includes(ext) ? ext : (k === 'multitrack' ? 'zip' : k === 'wav' ? 'wav' : 'mp3');
    const safe = String(orderId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'order';
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${safe}-${k}-${rand}.${e}`;
    const bucket = process.env.SONGS_BUCKET || 'Songs';
    const { uploadUrl, publicUrl } = await createSignedUpload(bucket, path);
    return res.status(200).json({ uploadUrl, publicUrl });
  } catch (err) {
    console.error('upload-url failed:', err);
    return res.status(500).json({ error: err.message });
  }
}
