const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const C = require('./core.js');
const box = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8'), box);
const seed = JSON.parse(JSON.stringify(box.window.SEED));
assert.equal(seed.items.length, 601);
assert.equal(
  seed.items.reduce((s, i) => s + C.value(i), 0),
  693646000,
);
const s = { ...seed, transfers: [] },
  i = s.items.find((i) => i.Codigo === 'EL-00001'),
  origin = i.Agrupacion_ID;
assert.throws(() =>
  C.requestTransfer(s, i.Codigo, origin, 'SALA', 'RESP-06', 'Prueba'),
);
assert.throws(() =>
  C.requestTransfer(s, i.Codigo, 'AGR-D-AM2', 'SALA', 'RESP-06', 'Prueba'),
);
const t = C.requestTransfer(
  s,
  i.Codigo,
  'AGR-D-SV',
  'SALA',
  'RESP-06',
  'Reutilización',
);
assert.equal(i.Agrupacion_ID, origin);
assert.equal(i.Estado_gestion, 'Asignado');
assert.throws(() =>
  C.requestTransfer(s, i.Codigo, 'AGR-BOD', 'A1', 'RESP-06', 'Duplicado'),
);
assert.throws(() => C.advanceTransfer(s, t.id, 'receive', 'RESP-05'));
C.advanceTransfer(s, t.id, 'approve', 'RESP-06');
assert.equal(i.Estado_gestion, 'En tránsito');
assert.equal(i.Agrupacion_ID, origin);
C.advanceTransfer(s, t.id, 'receive', 'RESP-05');
assert.equal(i.Agrupacion_ID, 'AGR-D-SV');
assert.equal(i.Proyecto_ID, 'PRY-D');
assert.equal(i.Estado_gestion, 'Asignado');
assert.equal(t.receivedBy, 'RESP-05');
assert.throws(() => C.advanceTransfer(s, t.id, 'receive', 'RESP-05'));
const t2 = C.requestTransfer(s, i.Codigo, 'AGR-BOD', 'A1', 'RESP-06', 'Almacenar');
C.advanceTransfer(s, t2.id, 'approve', 'RESP-06');
C.advanceTransfer(s, t2.id, 'receive', 'RESP-06');
assert(C.available(i));
assert.throws(() => C.validateItem({ ...i, Cantidad: 0 }, [], s.groups));
assert.throws(() => C.validateItem({ ...i, Cantidad: 1.5 }, [], s.groups));
assert.throws(() => C.validateItem({ ...i, Valor_unitario_COP: -1 }, [], s.groups));
assert.throws(() => C.validateItem({ ...i }, s.items, s.groups));
C.validateItem(i, s.items, s.groups, i);
assert(!C.active({ ...i, Estado_gestion: 'De baja' }));
assert(!C.active({ ...i, Estado_gestion: 'Vendido' }));
assert(!C.available({ ...i, Estado_fisico: 'Dañado' }));
console.log(
  'OK: datos de origen, validación, rechazo de duplicados, flujo de traslado, recepción, disponibilidad y exclusión de bajas/ventas.',
);
