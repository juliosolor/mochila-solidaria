// Muestrario de artículos. Se siembra en la base de datos la primera vez;
// después el propietario los edita desde su panel (precio, comisión, coste, activo).
// supplier_ref: referencia interna del proveedor. NUNCA se envía al navegador.
module.exports = [
  { id: 'camiseta', name: 'Camiseta',              shape: 'tee',    sizes: true,  price: 14, com: 4,   cost: 7.5, ref: '', sort: 1 },
  { id: 'polo',     name: 'Polo',                  shape: 'polo',   sizes: true,  price: 19, com: 5,   cost: 11,  ref: '', sort: 2 },
  { id: 'sudadera', name: 'Sudadera con capucha',  shape: 'hoodie', sizes: true,  price: 28, com: 7,   cost: 17,  ref: '', sort: 3 },
  { id: 'gorra',    name: 'Gorra',                 shape: 'cap',    sizes: false, price: 12, com: 3.5, cost: 6.5, ref: '', sort: 4 },
  { id: 'bolsa',    name: 'Bolsa de tela',         shape: 'tote',   sizes: false, price: 9,  com: 3,   cost: 4.5, ref: '', sort: 5 },
  { id: 'mochila',  name: 'Mochila de cuerdas',    shape: 'sack',   sizes: false, price: 12, com: 4,   cost: 6,   ref: '', sort: 6 },
  { id: 'taza',     name: 'Taza',                  shape: 'mug',    sizes: false, price: 10, com: 3,   cost: 5,   ref: '', sort: 7 },
  { id: 'botella',  name: 'Botella reutilizable',  shape: 'bottle', sizes: false, price: 15, com: 4,   cost: 9,   ref: '', sort: 8 },
];
