const PDFDocument = require('pdfkit');
const SVGtoPDF = require('svg-to-pdfkit');
const QRCode = require('qrcode');
const { svg, inkFor } = require('./art');
const { eur } = require('./util');
const cfg = require('./config');

const dataBuf = (d) => { try { return d ? Buffer.from(d.split(',')[1], 'base64') : null; } catch { return null; } };
const sellerUrl = (s) => `${cfg.baseUrl}/c/${s.code}`;
const hex = (h) => h;

function tryImage(doc, d, x, y, opts) {
  const b = dataBuf(d); if (!b) return false;
  try { doc.image(b, x, y, opts); return true; } catch { return false; }
}
async function qrBuf(text, w = 400) { return QRCode.toBuffer(text, { margin: 1, width: w, errorCorrectionLevel: 'M' }); }

async function catalogPdf({ entity, seller, products }, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Catálogo de ${seller.name}`, Author: entity.name } });
  doc.pipe(stream);
  const W = doc.page.width, H = doc.page.height;
  const ink = inkFor(entity.color);
  // Portada
  doc.rect(0, 0, W, 190).fill(entity.color);
  tryImage(doc, entity.logo, 40, 40, { fit: [110, 110], align: 'center', valign: 'center' });
  doc.fillColor(ink).font('Helvetica-Bold').fontSize(26).text(entity.name, 170, 62, { width: W - 210 });
  doc.font('Helvetica').fontSize(13).text('Tienda solidaria', 170, 120, { width: W - 210 });
  doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(12).text('ESTO ES PARA', 40, 225);
  doc.fillColor('#14181f').fontSize(38).text(seller.name, 40, 245, { width: W - 80 });
  const goal = seller.goal_title || entity.goal_title;
  doc.font('Helvetica').fontSize(16).fillColor('#374151').text(goal, 40, doc.y + 6, { width: W - 80 });
  let y = doc.y + 16;
  y += 14;

  if (seller.thanks) { doc.font('Helvetica-Oblique').fontSize(15).fillColor('#14181f').text(`«${seller.thanks}»`, 40, y, { width: W - 80 }); y = doc.y + 14; }
  const qy = Math.max(y + 10, 470);
  const q = await qrBuf(sellerUrl(seller));
  doc.image(q, 40, qy, { width: 190 });
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#14181f').text('Escanea el QR o entra con el código', 250, qy + 14, { width: W - 290 });
  doc.font('Courier-Bold').fontSize(30).text(seller.code, 250, qy + 40);
  doc.font('Helvetica').fontSize(11).fillColor('#374151').text(sellerUrl(seller), 250, qy + 82, { width: W - 290 });
  doc.fontSize(11).text('Todo lo que compres con este código va al objetivo de esta persona. Los pedidos se entregan en tu domicilio.', 250, qy + 110, { width: W - 290 });
  if (seller.photo) tryImage(doc, seller.photo, W - 150, 215, { fit: [110, 110] });

  // Productos, 6 por página
  const per = 6;
  for (let i = 0; i < products.length; i += per) {
    doc.addPage({ size: 'A4', margin: 0 });
    doc.rect(0, 0, W, 54).fill(entity.color);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(16).text(`${entity.name} · para ${seller.name}`, 40, 19, { width: W - 80 });
    products.slice(i, i + per).forEach((p, k) => {
      const col = k % 2, row = Math.floor(k / 2);
      const x = 40 + col * 270, yy = 80 + row * 235;
      doc.roundedRect(x, yy, 245, 215, 10).lineWidth(1).strokeColor('#e3e5ea').stroke();
      SVGtoPDF(doc, svg(p.shape, entity.color, '', null), x + 50, yy + 12, { width: 145, height: 145, assumePt: true });
      doc.fillColor('#14181f').font('Helvetica-Bold').fontSize(14).text(p.name, x + 14, yy + 168, { width: 150 });
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(p.sizes ? 'Varias tallas' : '', x + 14, yy + 188);
      doc.font('Helvetica-Bold').fontSize(17).fillColor('#14181f').text(eur(p.price_cents), x + 150, yy + 168, { width: 82, align: 'right' });
    });
    doc.font('Courier-Bold').fontSize(11).fillColor('#374151').text(`${seller.code}  ·  ${sellerUrl(seller)}`, 40, H - 40, { width: W - 80, align: 'center' });
  }
  doc.end();
}

// Tarjetas con QR de todos los vendedores (8 por hoja)
async function cardsPdf({ entity, sellers }, stream) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Tarjetas QR · ${entity.name}` } });
  doc.pipe(stream);
  const cw = 255, ch = 190, mx = 36, my = 30;
  for (let i = 0; i < sellers.length; i++) {
    const k = i % 8;
    if (i && k === 0) doc.addPage({ size: 'A4', margin: 0 });
    const x = mx + (k % 2) * (cw + 8), y = my + Math.floor(k / 2) * (ch + 8);
    const s = sellers[i];
    doc.roundedRect(x, y, cw, ch, 10).lineWidth(1).strokeColor('#c9ced8').stroke();
    doc.rect(x, y, cw, 30).fill(entity.color);
    doc.fillColor(inkFor(entity.color)).font('Helvetica-Bold').fontSize(10.5).text(entity.name, x + 10, y + 10, { width: cw - 20, lineBreak: false });
    doc.image(await qrBuf(sellerUrl(s), 300), x + 10, y + 40, { width: 110 });
    doc.fillColor('#14181f').font('Helvetica-Bold').fontSize(13).text(s.name, x + 128, y + 44, { width: cw - 138 });
    doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280').text(s.goal_title || entity.goal_title, x + 128, doc.y + 2, { width: cw - 138 });
    doc.font('Courier-Bold').fontSize(16).fillColor('#14181f').text(s.code, x + 128, y + 128);
    doc.font('Helvetica').fontSize(7.5).fillColor('#6b7280').text(cfg.baseUrl.replace(/^https?:\/\//, ''), x + 10, y + 158, { width: cw - 20 });
  }
  if (!sellers.length) doc.fontSize(14).text('No hay vendedores todavía.', 40, 60);
  doc.end();
}
module.exports = { catalogPdf, cardsPdf, qrBuf, sellerUrl };
