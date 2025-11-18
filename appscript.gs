const SHEET_NAME = 'RSVP';
const REQUIRED_COLUMNS = ['timestamp', 'email', 'status', 'guest_count'];

function doGet(e) {
  const email = normalizeEmail(e?.parameter?.email);
  if (!email) return respond(400, { error: 'missing_email' });

  try {
    const ctx = getContext();
    const match = findRow(ctx, email);
    if (!match) return respond(404, { error: 'not_invited' });

    const row = match.values;
    const m = ctx.map;
    return respond(200, {
      status: String(row[m.status] || 'PENDING').toUpperCase(),
      guestCount: Number(row[m.guest_count]) || 0,
      guestNames: [] // keep same shape for client
    });
  } catch (err) {
    return respond(500, { error: err.message });
  }
}

function doPost(e) {
  const payload = parse(e);
  const email = normalizeEmail(payload.email);
  if (!email) return respond(400, { error: 'missing_email' });

  try {
    const ctx = getContext();
    const match = findRow(ctx, email);
    if (!match) return respond(404, { error: 'not_invited' });

    const sheet = ctx.sheet;
    const rowNumber = match.row;
    const m = ctx.map;

    const count = Math.min(Math.max(Number(payload.guestCount) || 1, 1), 4);

    sheet.getRange(rowNumber, m.status + 1).setValue('YES');
    sheet.getRange(rowNumber, m.guest_count + 1).setValue(count);
    sheet.getRange(rowNumber, m.timestamp + 1).setValue(new Date());

    return respond(200, { status: 'ok' });
  } catch (err) {
    return respond(500, { error: err.message });
  }
}

function doOptions() {
  return respond(204, {});
}

function parse(e) {
  if (!e?.postData?.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (_err) {
    return {};
  }
}

function normalizeEmail(val) {
  return val ? String(val).trim().toLowerCase() : '';
}

function getContext() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found.`);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const map = {};
  REQUIRED_COLUMNS.forEach(col => {
    const idx = headers.indexOf(col);
    if (idx === -1) throw new Error(`Column "${col}" missing from sheet.`);
    map[col] = idx;
  });
  return { sheet, headers, map };
}

function findRow(ctx, email) {
  const { sheet, headers, map } = ctx;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  for (let i = 0; i < data.length; i++) {
    const rowEmail = normalizeEmail(data[i][map.email]);
    if (rowEmail === email) {
      return { row: i + 2, values: data[i] };
    }
  }
  return null;
}

function respond(code, payload) {
  const out = ContentService.createTextOutput(JSON.stringify(payload));
  out.setMimeType(ContentService.MimeType.JSON);
  out.setResponseCode(code);
  out.setHeader('Access-Control-Allow-Origin', '*');
  out.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  out.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  return out;
}
