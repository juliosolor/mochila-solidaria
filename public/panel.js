// Redimensiona imágenes en el navegador y las deja en un campo oculto como data URL
document.querySelectorAll('input[type=file][data-target]').forEach(function (inp) {
  inp.addEventListener('change', function () {
    var f = inp.files[0]; if (!f) return;
    var max = Number(inp.dataset.max || 600), target = document.getElementById(inp.dataset.target);
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var k = Math.min(1, max / Math.max(im.width, im.height));
        var c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        var ctx = c.getContext('2d');
        var png = inp.dataset.type !== 'jpeg';
        if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(im, 0, 0, c.width, c.height);
        target.value = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.82);
        var pv = document.getElementById(inp.dataset.target + '-pv'); if (pv) { pv.src = target.value; pv.hidden = false; }
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(f);
  });
});
document.querySelectorAll('[data-clear]').forEach(function (b) {
  b.addEventListener('click', function () {
    document.getElementById(b.dataset.clear).value = '__clear__';
    var pv = document.getElementById(b.dataset.clear + '-pv'); if (pv) pv.hidden = true;
  });
});
// Vista previa de colores
var c1 = document.getElementById('color'), c2 = document.getElementById('color2'), pv = document.getElementById('brand-pv');
function lum(h) { var n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
function paint() { if (!pv) return; pv.style.background = c1.value; pv.style.color = lum(c1.value) > 0.6 ? '#0F1B3D' : '#fff'; pv.querySelector('b').style.background = c2.value; }
if (c1) { c1.addEventListener('input', paint); c2.addEventListener('input', paint); paint(); }
// Copiar enlaces
document.querySelectorAll('[data-copy]').forEach(function (b) {
  b.addEventListener('click', function () { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy).then(function () { var t = b.textContent; b.textContent = 'Copiado'; setTimeout(function () { b.textContent = t; }, 1200); }); });
});
