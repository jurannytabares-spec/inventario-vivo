const assert = require('node:assert/strict');
const A = require('./analytics.js');
const state = {
  checks: [
    {
      Codigo: 'SIN CÓDIGO',
      Elemento: 'Cojín',
      Cantidad_registrada: 0,
      Cantidad_encontrada: 2,
    },
  ],
  items: [{ Codigo: 'EL-1', Elemento: 'Mesa', Proyecto_ID: 'PRY-B' }],
  groups: [
    { Agrupacion_ID: 'AGR-A', Proyecto_ID: 'PRY-A' },
    { Agrupacion_ID: 'AGR-B', Proyecto_ID: 'PRY-B' },
  ],
  history: [],
  audits: [
    {
      code: 'EL-1',
      element: 'Mesa',
      projectId: 'PRY-A',
      groupId: 'AGR-A',
      date: '2026-11-24',
      recorded: 2,
      found: 1,
    },
  ],
};
let list = A.verificationRecords(state);
assert.equal(list[0].projectId, 'PRY-A');
assert.equal(list[0].difference, -1);
assert.equal(list[1].code, 'SIN CÓDIGO');
assert.equal(list[1].projectId, 'PRY-C');
state.audits = [
  { code: 'EL-1', location: 'AGR-A / SALA', date: '2026-11-24', recorded: 2, found: 2 },
];
assert.equal(A.verificationRecords(state)[0].projectId, 'PRY-A');
state.audits[0].location = 'Ubicación no identificada';
assert.equal(A.verificationRecords(state)[0].projectId, '');
state.history = [
  {
    Codigo: 'EL-1',
    Tipo: 'Verificación física',
    Origen: 'AGR-A',
    Despues: { date: '2026-11-24' },
  },
];
assert.equal(A.verificationRecords(state)[0].groupId, 'AGR-A');
console.log(
  'OK: conteo histórico, sin código, conteos nuevos y ubicación preservada tras traslado.',
);
