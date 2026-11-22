// Fast drop-in for csv-reader 1.0.0: same answers for every input. Delimiter search runs on
// native indexOf scans kept monotonic (each candidate position is computed once), and field
// values are built from text.slice() segments, never character by character.

const INF = 0x7fffffff;

let R_value = '';  // scan result: field value
let R_kind = 0;    // scan result: 0 comma, 1 line break, 2 end of text
let R_next = 0;    // scan result: next index

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let i = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  let recordLine = 1;
  let recordRow = null;

  // Next occurrence of each delimiter, at or after the scan position; monotonic, so each
  // index scan happens at most once over the whole text.
  let pComma = -1, pLF = -1, pCR = -1, pQ = -1;
  function rescan(from) {
    pComma = text.indexOf(',', from);
    pLF = text.indexOf('\n', from);
    pCR = text.indexOf('\r', from);
    pQ = text.indexOf('"', from);
  }
  function fix(from) {
    if (pComma < from) pComma = text.indexOf(',', from);
    if (pLF < from) pLF = text.indexOf('\n', from);
    if (pCR < from) pCR = text.indexOf('\r', from);
    if (pQ < from) pQ = text.indexOf('"', from);
  }
  rescan(i);

  // Scans an unquoted field from `start`, with `prefix` already accumulated before it.
  // stray_cr: a CR not followed by LF outside quotes is dropped and the field goes on.
  function scanUnquoted(start, prefix) {
    let j = start;
    let vs = start;
    let value = prefix;
    fix(j);
    while (j < len) {
      const c = pComma < 0 ? INF : pComma;
      const nc = pLF < 0 ? INF : pLF;
      const rc = pCR < 0 ? INF : pCR;
      const m = c < nc ? (c < rc ? c : rc) : (nc < rc ? nc : rc);
      if (m === INF) {
        if (len > vs) value += text.slice(vs, len);
        R_value = value; R_kind = 2; R_next = len;
        return;
      }
      if (m === c) {
        if (c > vs) value += text.slice(vs, c);
        R_value = value; R_kind = 0; R_next = c + 1;
        return;
      }
      if (m === rc && nc === rc + 1) {
        // CRLF ends the field
        if (rc > vs) value += text.slice(vs, rc);
        R_value = value; R_kind = 1; R_next = rc + 2;
        return;
      }
      if (m === nc) {
        if (nc > vs) value += text.slice(vs, nc);
        R_value = value; R_kind = 1; R_next = nc + 1;
        return;
      }
      // lone CR outside quotes: dropped (stray_cr), the field goes on
      if (rc > vs) { value += text.slice(vs, rc); vs = rc; }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      j = rc + 1;
      vs = j;
      fix(j);
    }
    if (len > vs) value += text.slice(vs, len);
    R_value = value; R_kind = 2; R_next = len;
  }

  // Scans a quoted field whose opening quote is at `open`.
  function scanQuoted(open) {
    const openLine = line;
    let j = open + 1;
    let vs = j;
    let value = '';
    fix(j);
    while (j < len) {
      const q = pQ < 0 ? INF : pQ;
      const nc = pLF < 0 ? INF : pLF;
      const rc = pCR < 0 ? INF : pCR;
      const m = q < nc ? (q < rc ? q : rc) : (nc < rc ? nc : rc);
      if (m === INF) break; // the quote never closes
      if (m === q) {
        if (text.charCodeAt(q + 1) === 34) {
          // doubled quote: one literal quote inside the field
          value += text.slice(vs, q) + '"';
          j = q + 2;
          vs = j;
          fix(j);
          continue;
        }
        // closing quote
        value += text.slice(vs, q);
        const close = q + 1;
        if (close >= len) { R_value = value; R_kind = 2; R_next = len; return; }
        const ch = text[close];
        if (ch === ',') { R_value = value; R_kind = 0; R_next = close + 1; return; }
        if (ch === '\n') { R_value = value; R_kind = 1; R_next = close + 1; return; }
        if (ch === '\r' && text.charCodeAt(close + 1) === 10) { R_value = value; R_kind = 1; R_next = close + 2; return; }
        // what follows the closing quote, up to the next comma or line break, is appended as it stands
        const before = value.length;
        scanUnquoted(close, value);
        if (R_value.length > before) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        return;
      }
      if (m === rc && nc === rc + 1) {
        // CRLF inside quotes is one LF
        value += text.slice(vs, rc) + '\n';
        line++;
        j = rc + 2;
        vs = j;
        fix(j);
        continue;
      }
      if (m === rc) {
        // a lone CR inside quotes is one LF
        value += text.slice(vs, rc) + '\n';
        line++;
        j = rc + 1;
        vs = j;
        fix(j);
        continue;
      }
      // LF inside quotes stays in the value; only the line count moves
      line++;
      j = nc + 1;
      fix(j);
    }
    // the quote never closes: a literal character, and the text after it is read again as unquoted
    i = open + 1;
    line = openLine;
    errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
    rescan(open + 1);
    scanUnquoted(open + 1, '"');
  }

  while (true) {
    // lines with no characters are no records
    while (i < len) {
      const ch = text.charCodeAt(i);
      if (ch === 10) i++;
      else if (ch === 13 && text.charCodeAt(i + 1) === 10) i += 2;
      else break;
      line++;
    }
    if (i >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let quoted = false;
    let kind = 0;
    do {
      quoted = text.charCodeAt(i) === 34;
      if (quoted) scanQuoted(i); else scanUnquoted(i, '');
      i = R_next;
      kind = R_kind;
      if (kind === 1) line++;
      fields.push(R_value);
    } while (kind === 0);
    fix(i);

    // a line that held only stray CRs is left with no characters: no record (its stray_cr errors stay)
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
