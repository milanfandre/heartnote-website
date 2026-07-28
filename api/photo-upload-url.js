// Returns a short-lived signed URL so a customer's browser can upload their CD
// cover photo straight to Storage, before they pay.
//
// This endpoint is deliberately PUBLIC — the photo is chosen before checkout,
// so there is no order and no credential to authenticate against yet. It is
// kept narrow on purpose, and must never be widened to the Songs bucket:
//   * writes only to COVERS_BUCKET, never anywhere near customer masters
//   * image extensions only, and the bucket itself enforces an image-only MIME
//     allowlist and a size cap, so a forged request still cannot store anything
//     other than a reasonably sized image
//   * the filename is generated here; nothing the caller sends reaches the path
import { createSignedUpload, supabaseReady } from '../lib/db.js';

const EXTS = { jpg: 'jpg', jpeg: 'jpg', png: 'png', heic: 'heic', webp: 'webp' };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  if (!supabaseReady()) return res.status(500).json({ error: 'Storage not configured' });
  try {
    const { ext } = req.body || {};
    const e = EXTS[String(ext || '').toLowerCase().replace(/^\./, '')];
    if (!e) return res.status(400).json({ error: 'Please upload a JPG, PNG, HEIC or WEBP image.' });

    // Caller-supplied text never reaches the storage path.
    const rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const bucket = process.env.COVERS_BUCKET || 'Covers';
    const { uploadUrl, publicUrl } = await createSignedUpload(bucket, `cover-${rand}.${e}`);
    return res.status(200).json({ uploadUrl, publicUrl });
  } catch (err) {
    console.error('photo-upload-url failed:', err);
    return res.status(500).json({ error: 'Could not prepare the upload.' });
  }
}
