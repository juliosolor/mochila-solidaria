const { esc } = require('./util');
const cfg = require('./config');
const { logoMark } = require('./marca');

function page({ title, body, desc = '', nav = 'public', current = '', head = '', scripts = '', theme = null, bare = false, noindex = false }) {
  const t = theme ? `:root{--brand:${theme.color};--brand-ink:${theme.ink};--accent:${theme.color2}}` : '';
  const links = {
    public: [['/', 'Inicio'], ['/como-funciona', 'Cómo funciona'], ['/alta', 'Dar de alta mi entidad'], ['/panel', 'Acceso entidades']],
    panel: [['/panel', 'Resumen'], ['/panel/vendedores', 'Vendedores'], ['/panel/tienda', 'Mi tienda'], ['/panel/dinero', 'Dinero'], ['/panel/datos', 'Datos'], ['/panel/salir', 'Salir']],
    owner: [['/propietario', 'Negocio'], ['/propietario/tiendas', 'Tiendas'], ['/propietario/vendedores', 'Vendedores'], ['/propietario/retiradas', 'Retiradas'], ['/propietario/catalogo', 'Catálogo'], ['/propietario/salir', 'Salir']],
    none: [],
  }[nav] || [];
  const header = bare ? '' : `<header class="site-head"><div class="wrap">
    <a class="logo" href="${nav === 'owner' ? '/propietario' : '/'}">${logoMark(32)}<span>${esc(cfg.brand)}</span>${nav === 'owner' ? ' <span class="chip">Propietario</span>' : ''}</a>
    <nav class="nav" aria-label="Principal">${links.map(([h, l]) => `<a href="${h}"${h === current ? ' aria-current="page"' : ''}${nav === 'public' && h === '/alta' ? ' class="cta"' : ''}>${l}</a>`).join('')}</nav></div></header>`;
  const footer = bare ? '' : `<footer class="foot"><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(cfg.brand)}</span>
    <a href="/privacidad">Protección de datos y confidencialidad</a><a href="/aviso-legal">Aviso legal</a><a href="/como-funciona">Cómo funciona</a><a href="mailto:${esc(cfg.contactEmail)}">Contacto</a></div></footer>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta name="robots" content="${noindex || nav === 'owner' || nav === 'panel' ? 'noindex,nofollow' : 'index,follow'}">
<link rel="stylesheet" href="/app.css"><style>${t}</style>${head}</head><body>${header}${body}${footer}${scripts}</body></html>`;
}
const alertBox = (msg, kind = 'err') => msg ? `<div class="alert ${kind}" role="alert">${esc(msg)}</div>` : '';
module.exports = { page, alertBox };
