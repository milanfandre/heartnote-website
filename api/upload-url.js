// Returns a short-lived signed URL so the browser can upload the finished MP3
// straight to Supabase Storage (bypasses the serverless body-size limit).
import { createSignedUpload, supabaseReady } from '../lib/db.js';
import { adminAuthed } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
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
