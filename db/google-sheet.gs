/**
 * ─────────────────────────────────────────────────────────────
 *  Heart Note → Google Sheet
 * ─────────────────────────────────────────────────────────────
 *  This makes every paid order drop into a Google Sheet as a new row,
 *  so you (or your client) can watch orders come in — no login, no database.
 *
 *  ONE-TIME SETUP
 *   1. Go to sheets.google.com and create a new blank spreadsheet.
 *      Name it e.g. "Heart Note — Orders".
 *   2. In that sheet: Extensions → Apps Script.
 *   3. Delete whatever code is there, paste THIS whole file in, click Save.
 *   4. Click Deploy → New deployment.
 *        - Select type (gear icon) → Web app
 *        - Description: "Heart Note orders"
 *        - Execute as: Me
 *        - Who has access: Anyone
 *        - Deploy → authorize/allow when Google asks.
 *   5. Copy the "Web app URL" it gives you (ends in /exec).
 *   6. In Vercel → Settings → Environment Variables, add:
 *        GOOGLE_SHEET_WEBHOOK_URL = (that /exec URL)
 *      then redeploy.
 *   7. Share the spreadsheet with your client (Share button, top-right).
 *
 *  The header row is created automatically on the first order.
 * ─────────────────────────────────────────────────────────────
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // avoid two orders writing at the same instant
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var body = JSON.parse(e.postData.contents);

    // First order ever: lay down the bold, frozen header row.
    if (sheet.getLastRow() === 0 && body.headers) {
      sheet.appendRow(body.headers);
      sheet.getRange(1, 1, 1, body.headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow(body.values);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
