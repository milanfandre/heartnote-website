// Shared-password gate for the Deliver tool APIs. The song-maker enters the
// password in the browser; it's sent as a header and checked here.
export function adminAuthed(req) {
  const pw = process.env.ADMIN_PASSWORD || '';
  return Boolean(pw) && req.headers['x-admin-password'] === pw;
}
