(function () {
  var root = document.getElementById('seller-root');
  if (!root) return;
  var code = root.dataset.code;
  var prods = JSON.parse(document.getElementById('prods').textContent);
  var byId = {}; prods.forEach(function (p) { byId[p.id] = p; });
  var KEY = 'rs_cart_' + code, cart = [];
  try { cart = JSON.parse(localStorage.getItem(KEY) || '[]').filter(function (l) { return byId[l.id]; }); } catch (e) { cart = []; }
  var $ = function (s) { return document.querySelector(s); };
  var eur = function (c) { return (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} }
  function total() { return cart.reduce(function (a, l) { return a + byId[l.id].price_cents * l.qty; }, 0); }
  function count() { return cart.reduce(function (a, l) { return a + l.qty; }, 0); }
  function text(el, t) { el.textContent = t; return el; }

  function render() {
    $('#cart-count').textContent = count();
    var box = $('#cart-lines'); box.textContent = '';
    if (!cart.length) { box.appendChild(text(document.createElement('p'), 'Tu cesta está vacía.')).className = 'note'; }
    cart.forEach(function (l, i) {
      var p = byId[l.id], d = document.createElement('div'); d.className = 'line';
      var left = document.createElement('div');
      left.appendChild(text(document.createElement('b'), p.name));
      if (l.size) left.appendChild(text(document.createElement('div'), 'Talla ' + l.size)).className = 'note';
      left.appendChild(text(document.createElement('div'), eur(p.price_cents))).className = 'note';
      var right = document.createElement('div'); right.style.cssText = 'display:flex;gap:6px;align-items:center';
      [['−', -1], ['+', 1]].forEach(function (b, bi) {
        var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn ghost sm'; btn.textContent = b[0];
        btn.setAttribute('aria-label', b[1] < 0 ? 'Quitar una unidad' : 'Añadir una unidad');
        btn.onclick = function () { l.qty += b[1]; if (l.qty < 1) cart.splice(i, 1); if (l.qty > 20) l.qty = 20; save(); render(); };
        if (bi === 1) right.appendChild(text(document.createElement('span'), l.qty));
        right.appendChild(btn);
      });
      d.appendChild(left); d.appendChild(right); box.appendChild(d);
    });
    $('#cart-total').textContent = eur(total());
    $('#pay-btn').disabled = !cart.length;
  }
  function open(v) { $('#cart').hidden = !v; $('#scrim').hidden = !v; setTimeout(function () { $('#cart').classList.toggle('open', v); }, 10); }
  document.querySelectorAll('[data-add]').forEach(function (b) {
    b.onclick = function () {
      var id = b.dataset.add, card = b.closest('.prod'), sel = card.querySelector('select');
      var size = sel ? sel.value : '';
      var f = cart.find(function (l) { return l.id === id && l.size === size; });
      if (f) f.qty = Math.min(20, f.qty + 1); else cart.push({ id: id, size: size, qty: 1 });
      save(); render(); b.textContent = 'Añadido ✓'; setTimeout(function () { b.textContent = 'Añadir'; }, 1100);
    };
  });
  $('#open-cart').onclick = function () { open(true); };
  $('#close-cart').onclick = function () { open(false); };
  $('#scrim').onclick = function () { open(false); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });

  $('#checkout').onsubmit = function (e) {
    e.preventDefault();
    var err = $('#co-err'); err.hidden = true;
    var f = new FormData(e.target), buyer = {};
    f.forEach(function (v, k) { buyer[k] = v; });
    var btn = $('#pay-btn'); btn.disabled = true; btn.textContent = 'Un momento…';
    fetch('/api/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, items: cart, buyer: buyer }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.j.error || 'No se pudo crear el pedido');
        try { localStorage.removeItem(KEY); } catch (e) {}
        location.href = r.j.url;
      })
      .catch(function (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; btn.textContent = 'Pagar con tarjeta'; });
  };
  render();
})();
