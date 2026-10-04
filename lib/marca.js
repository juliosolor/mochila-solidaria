// Marca de la plataforma: una mochila de excursión con su bolsillo delantero.
function logoMark(size = 30) {
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  <path d="M12 6.5 C12 3.5 20 3.5 20 6.5" fill="none" stroke="var(--ink)" stroke-width="2.2" stroke-linecap="round"/>
  <rect x="4.5" y="6" width="23" height="23" rx="8" fill="var(--brand)"/>
  <rect x="9" y="17" width="14" height="9" rx="3" fill="var(--accent)"/>
  <rect x="12.5" y="20.5" width="7" height="2.2" rx="1.1" fill="var(--ink)"/>
  <path d="M9.5 11.5 H22.5" stroke="var(--paper)" stroke-width="2.2" stroke-linecap="round"/></svg>`;
}
module.exports = { logoMark };
