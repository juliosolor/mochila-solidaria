const crypto = require('crypto');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (cents) => (cents / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const toCents = (v) => Math.round(parseFloat(String(v ?? '0').replace(',', '.')) * 100) || 0;

function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'tienda';
}

// Contraseñas: scrypt con sal
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function checkPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(pw, salt, 64);
  const real = Buffer.from(h, 'hex');
  return test.length === real.length && crypto.timingSafeEqual(test, real);
}
const token = () => crypto.randomBytes(32).toString('hex');
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Código personal de vendedor: 3 letras del nombre + 4 cifras, p. ej. LUC-4821
function codeFor(name) {
  const letters = String(name).normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase().padEnd(3, 'X').slice(0, 3);
  return `${letters}-${crypto.randomInt(1000, 10000)}`;
}
const normCode = (c) => String(c || '').trim().toUpperCase().replace(/\s+/g, '').replace(/^([A-Z]{3})(\d{4})$/, '$1-$2');

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Limitador sencillo en memoria (por IP y clave)
const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  return arr.length <= max;
}

// CSV muy simple (separador ; o , ; comillas dobles)
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const csvCell = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

const isHex = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const isImg = (d) => typeof d === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d) && d.length < 1_500_000;
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '');
function validIban(s) {
  const v = String(s || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
  let rem = 0; for (const ch of r) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

module.exports = { esc, eur, toCents, slugify, hashPassword, checkPassword, token, safeEq, codeFor, normCode,
  parseCookies, rateLimit, parseCsv, csvCell, isHex, isImg, validEmail, validIban };
