// Dibujos de producto (SVG) para el muestrario y las tiendas.
const { esc } = require('./util');
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = h => { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const inkFor = h => lum(h) > 0.6 ? '#0F1B3D' : '#FFFFFF';
function svg(shape,color,text,logo){
  const ink=lum(color)>0.6?'#1A1A1F':'#FFFFFF';
  const st=`fill="${color}" stroke="rgba(0,0,0,.28)" stroke-width="1.5" stroke-linejoin="round"`;
  let body='',ty=66;
  const tee=`<path ${st} d="M40 18 L22 30 L10 52 L26 60 L34 48 L34 104 L86 104 L86 48 L94 60 L110 52 L98 30 L80 18 Q60 32 40 18Z"/>`;
  if(shape==='tee')body=tee;
  if(shape==='polo'){ty=76;body=tee+`<path d="M44 20 L60 40 L76 20" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2.5" stroke-linejoin="round"/><path d="M60 40 V58" stroke="rgba(0,0,0,.3)" stroke-width="2"/><circle cx="60" cy="46" r="1.6" fill="rgba(0,0,0,.4)"/><circle cx="60" cy="53" r="1.6" fill="rgba(0,0,0,.4)"/>`}
  if(shape==='hoodie'){ty=72;body=`<path ${st} d="M40 24 L18 40 L12 92 L28 94 L34 62 L34 106 L86 106 L86 62 L92 94 L108 92 L102 40 L80 24Z"/><path ${st} d="M42 24 Q60 2 78 24 Q60 40 42 24Z" style="filter:brightness(.88)"/>`}
  if(shape==='cap'){ty=58;body=`<path ${st} d="M22 78 Q22 28 62 28 Q100 28 100 78Z"/><path ${st} d="M90 74 Q118 72 118 86 H70Z" style="filter:brightness(.88)"/>`}
  if(shape==='tote'){ty=80;body=`<path d="M44 44 V34 a16 16 0 0 1 32 0 V44" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="4" stroke-linecap="round"/><path ${st} d="M26 44 H94 L100 108 H20Z"/>`}
  if(shape==='sack'){ty=76;body=`<path d="M40 28 Q38 8 56 10 M80 28 Q82 8 64 10" fill="none" stroke="rgba(0,0,0,.5)" stroke-width="3" stroke-linecap="round"/><path ${st} d="M30 28 H90 L98 104 Q60 114 22 104Z"/><circle cx="40" cy="32" r="2.4" fill="rgba(0,0,0,.45)"/><circle cx="80" cy="32" r="2.4" fill="rgba(0,0,0,.45)"/>`}
  if(shape==='mug'){ty=72;body=`<path d="M84 50 H94 a11 11 0 0 1 0 28 H84" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="5"/><path ${st} d="M28 34 H84 V94 Q84 104 74 104 H38 Q28 104 28 94Z"/>`}
  if(shape==='bottle'){ty=78;body=`<rect x="50" y="8" width="20" height="12" rx="3" fill="rgba(0,0,0,.55)"/><path ${st} d="M52 20 H68 V30 Q86 38 86 56 V102 Q86 110 78 110 H42 Q34 110 34 102 V56 Q34 38 52 30Z"/>`}
  const t=(text||'').trim();
  const fs=t.length>12?7:t.length>8?8.5:10.5;
  const lg=logo?`<image href="${esc(logo)}" x="44" y="${ty-24}" width="32" height="32" preserveAspectRatio="xMidYMid meet"/>`:'';
  const label=t&&!logo?`<text x="60" y="${ty}" text-anchor="middle" font-family="Bricolage Grotesque,Segoe UI,sans-serif" font-weight="800" font-size="${fs}" fill="${ink}">${esc(t.toUpperCase())}</text>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${shape}">${body}${lg}${label}</svg>`;
}
module.exports = { svg, lum, inkFor };
