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

const ETHIOPIC_RE = /[ሀ-፿]/;
const DASH = '–';

function fontFor(text) {
  return ETHIOPIC_RE.test(text) ? 'AbyssinicaEthiopic' : 'AbyssinicaLatin';
}

function valueOf(member, key) {
  const raw = typeof member.get === 'function' ? member.get(key) : member[key];
  return raw == null || String(raw).trim() === '' ? null : String(raw).trim();
}

function joinNames(first, last) {
  const parts = [first, last].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

const MARGIN = 40;
const COLS = [
  { key: 'name', title: 'Name', x: MARGIN, width: 190 },
  { key: 'mother', title: "Mother's name", x: MARGIN + 200, width: 190 },
  { key: 'gender', title: 'Gender', x: MARGIN + 400, width: 80 }
];
const ROW_HEIGHT = 40;

function drawHeader(doc) {
  const y = doc.y;
  doc.font('AbyssinicaLatin').fontSize(10).fillColor('#111827');
  for (const col of COLS) {
    doc.text(col.title, col.x, y, { width: col.width, lineBreak: false });
  }
  const lineY = y + 16;
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + 480, lineY).strokeColor('#9ca3af').lineWidth(0.5).stroke();
  doc.y = lineY + 6;
}

function drawCell(doc, text, col, y, color) {
  doc.fillColor(color);
  doc.font(fontFor(text)).fontSize(10).text(text, col.x, y, { width: col.width, lineBreak: false, ellipsis: true });
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
    const name = joinNames(valueOf(member, 'firstname'), valueOf(member, 'lastname')) || DASH;
    const geezName = joinNames(valueOf(member, 'geezFirstname'), valueOf(member, 'geezLastname')) || DASH;
    const mother = valueOf(member, 'mothersname') || DASH;
    const geezMother = valueOf(member, 'geezMothersname') || DASH;
    const { label, color } = genderStyle(valueOf(member, 'gender'));

    drawCell(doc, name, COLS[0], y, '#111827');
    drawCell(doc, geezName, COLS[0], y + 14, '#374151');
    drawCell(doc, mother, COLS[1], y, '#111827');
    drawCell(doc, geezMother, COLS[1], y + 14, '#374151');
    drawCell(doc, label, COLS[2], y, color);
    doc.y = y + ROW_HEIGHT;
  }

  doc.end();
  return done;
}
