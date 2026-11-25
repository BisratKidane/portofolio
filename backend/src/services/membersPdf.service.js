import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fonts: Abyssinica SIL (SIL Open Font License 1.1), copied from the
// @fontsource/abyssinica-sil package into backend/assets/fonts so the backend
// does not depend on the frontend workspace's node_modules. A default PDF font
// renders Ge'ez as blanks, so the Ethiopic subset is embedded explicitly.
const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts');
const LATIN_FONT_PATH = path.join(FONT_DIR, 'abyssinica-sil-latin-400-normal.woff');
const ETHIOPIC_FONT_PATH = path.join(FONT_DIR, 'abyssinica-sil-ethiopic-400-normal.woff');

const GENDER_STYLES = {
  Male: { label: 'Male', color: '#1d4ed8' },
  Female: { label: 'Female', color: '#be185d' },
  Other: { label: 'Other', color: '#4b5563' }
};

export function genderStyle(gender) {
  return GENDER_STYLES[gender] || GENDER_STYLES.Other;
}


const LATIN = 'AbyssinicaLatin';
const ETHIOPIC = 'AbyssinicaEthiopic';
const ETHIOPIC_CHAR_RE = /[ሀ-፿]/;
// Whitespace, control, zero-width and bidi/format characters: the Ethiopic font
// has no glyph for most of them, and a newline would break the row.
const NOISE_RE = /[\s\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]+/g;

export function normalizeText(value) {
  return value == null ? '' : String(value).replace(NOISE_RE, ' ').trim();
}

// Split into runs so each run is drawn in the font that has its glyphs.
// Spaces and Latin text use the Latin font; only Ethiopic characters use the
// Ethiopic font (which does have a space glyph, but is not needed for it).
export function fontRuns(text) {
  const runs = [];
  for (const ch of text) {
    const font = ETHIOPIC_CHAR_RE.test(ch) ? ETHIOPIC : LATIN;
    const last = runs[runs.length - 1];
    if (last && last.font === font) last.text += ch;
    else runs.push({ text: ch, font });
  }
  return runs;
}

function valueOf(member, key) {
  const raw = typeof member.get === 'function' ? member.get(key) : member[key];
  return normalizeText(raw);
}

function joinNames(first, last) {
  return [first, last].filter(Boolean).join(' ');
}

export function memberRowCells(member) {
  return {
    id: valueOf(member, 'id'),
    name: joinNames(valueOf(member, 'firstname'), valueOf(member, 'lastname')),
    geezName: joinNames(valueOf(member, 'geezFirstname'), valueOf(member, 'geezLastname')),
    mother: valueOf(member, 'mothersname'),
    geezMother: valueOf(member, 'geezMothersname'),
    email: valueOf(member, 'email'),
    phone: valueOf(member, 'phone')
  };
}

export function fitFontSize(measure, text, width, start = 10, min = 6) {
  for (let size = start; size > min; size -= 0.5) {
    if (measure(text, size) <= width) return size;
  }
  return min;
}

const MARGIN = 40;
const GAP = 11;
const TABLE_WIDTH = 515;
const COL_DEFS = [
  { key: 'id', title: 'ID', width: 36 },
  { key: 'name', title: 'Name', width: 118 },
  { key: 'mother', title: "Mother's name", width: 108 },
  { key: 'contact', title: 'Contact', width: 160 },
  { key: 'gender', title: 'Gender', width: 48 }
];
let nextX = MARGIN;
const COLS = COL_DEFS.map((col) => {
  const placed = { ...col, x: nextX };
  nextX += col.width + GAP;
  return placed;
});
const [ID_COL, NAME_COL, MOTHER_COL, CONTACT_COL, GENDER_COL] = COLS;
const ROW_HEIGHT = 40;

function drawHeader(doc) {
  const y = doc.y;
  doc.font('AbyssinicaLatin').fontSize(10).fillColor('#111827');
  for (const col of COLS) {
    doc.text(col.title, col.x, y, { width: col.width, lineBreak: false });
  }
  const lineY = y + 16;
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + TABLE_WIDTH, lineY).strokeColor('#9ca3af').lineWidth(0.5).stroke();
  doc.y = lineY + 6;
}

function runsWidth(doc, runs, size) {
  let total = 0;
  for (const run of runs) total += doc.font(run.font).fontSize(size).widthOfString(run.text);
  return total;
}

function drawCell(doc, text, col, y, color, size = 10) {
  if (text === '') return;
  let runs = fontRuns(text);
  if (runsWidth(doc, runs, size) > col.width) {
    // Last resort at the size floor: trim characters and add an ellipsis.
    let chars = [...text];
    while (chars.length > 1 && runsWidth(doc, fontRuns(`${chars.join('')}…`), size) > col.width) chars.pop();
    runs = fontRuns(`${chars.join('').trimEnd()}…`);
  }
  doc.fillColor(color);
  let x = col.x;
  for (const run of runs) {
    doc.font(run.font).fontSize(size).text(run.text, x, y, { lineBreak: false });
    x += doc.widthOfString(run.text);
  }
}

function drawFitted(doc, text, col, y, color) {
  if (text === '') return;
  const size = fitFontSize((t, s) => runsWidth(doc, fontRuns(t), s), text, col.width);
  drawCell(doc, text, col, y, color, size);
}

export async function buildMembersPdf(members) {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: 'Family members' } });
  doc.registerFont('AbyssinicaLatin', LATIN_FONT_PATH);
  doc.registerFont('AbyssinicaEthiopic', ETHIOPIC_FONT_PATH);

  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.font('AbyssinicaLatin').fontSize(18).fillColor('#111827').text('Family members', MARGIN, MARGIN);
  doc.fontSize(9).fillColor('#4b5563').text(`Generated ${new Date().toISOString().slice(0, 10)}`);
  doc.moveDown(1);
  drawHeader(doc);

  const bottom = doc.page.height - MARGIN - ROW_HEIGHT;
  for (const member of members) {
    if (doc.y > bottom) {
      doc.addPage();
      doc.y = MARGIN;
      drawHeader(doc);
    }
    const y = doc.y;
    const cells = memberRowCells(member);
    const { label, color } = genderStyle(valueOf(member, 'gender'));

    drawFitted(doc, cells.id, ID_COL, y, '#111827');
    drawCell(doc, cells.name, NAME_COL, y, '#111827');
    drawCell(doc, cells.geezName, NAME_COL, y + 14, '#374151');
    drawCell(doc, cells.mother, MOTHER_COL, y, '#111827');
    drawCell(doc, cells.geezMother, MOTHER_COL, y + 14, '#374151');
    drawFitted(doc, cells.email, CONTACT_COL, y, '#111827');
    drawFitted(doc, cells.phone, CONTACT_COL, y + 14, '#374151');
    drawCell(doc, label, GENDER_COL, y, color);
    doc.y = y + ROW_HEIGHT;
  }

  doc.end();
  return done;
}
