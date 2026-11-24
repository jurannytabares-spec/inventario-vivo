const assert = require('node:assert/strict'),
  A = require('./analytics.js');
const p = A.period(2026, 3, 1);
assert.equal(p.start, '2026-01-01');
assert.equal(p.end, '2026-04-01');
assert.equal(p.previousStart, '2025-10-01');
assert.equal(A.period(2026, 6, 2).end, '2027-01-01');
assert.equal(A.period(2026, 12, 1).previousStart, '2025-01-01');
assert(A.inside('2026-03-31', '2026-01-01', '2026-04-01'));
assert(!A.inside('2026-04-01', '2026-01-01', '2026-04-01'));
assert.equal(A.dateKey('2026-04-01T02:00:00.000Z'), '2026-03-31');
const state = {
  projects: [{ Proyecto_ID: 'P1' }, { Proyecto_ID: 'P2' }],
  groups: [
    { Agrupacion_ID: 'G1', Proyecto_ID: 'P1' },
    { Agrupacion_ID: 'G2', Proyecto_ID: 'P2' },
  ],
  items: [
    {
      Codigo: 'EL-1',
      Categoria: 'Mobiliario',
      Cantidad: 2,
      Valor_unitario_COP: 100,
      Fecha_compra: '2026-01-15',
      Proyecto_ID: 'P2',
    },
  ],
  history: [
    'Solicitud de traslado',
    'Despacho aprobado',
    'Recepción confirmada',
    'Envío a reparación',
    'Retorno de reparación',
  ].map((Tipo, j) => ({
    Mov_ID: j,
    Tipo,
    Codigo: 'EL-1',
    Origen: 'G1',
    Destino: 'G2',
    Fecha: '2026-02-01',
  })),
  expenses: [
    {
      date: '2026-01-20',
      amount: 300,
      type: 'Reparación',
      category: 'Mobiliario',
      project: 'P1',
      reference: 'F1',
    },
  ],
};
const r = A.report(state, p, '', new Date('2026-11-24T12:00:00Z'));
assert.equal(r.moves.length, 1);
assert.equal(r.repairs.length, 1);
assert.equal(r.buys.length, 1);
assert.equal(r.purchaseReference, 200);
assert.equal(r.cost, 300);
assert.equal(r.elapsed, 90);
assert.equal(r.categories[0].repairs, 1);
assert.equal(r.monthly[0].cost, 300);
assert.equal(r.monthly[1].cost, 0);
assert.equal(r.monthly[1].moves, 1);
assert.equal(A.report(state, p, 'P1').moves.length, 1);
assert.equal(A.report(state, p, 'P1').purchaseReference, 0);
assert.equal(A.report(state, p, 'P2').cost, 0);
assert.equal(A.projection(300, 90, 3, 0), (300 / 90) * (365.25 / 12) * 3);
assert.equal(A.projection(300, 0, 3, 0), null);
assert.equal(A.projection(300, 90, 3, -100), 0);
assert.throws(() => A.validateExpense({ ...state.expenses[0], amount: -1 }, state));
assert.throws(() => A.validateExpense(state.expenses[0], state));
assert.throws(() =>
  A.validateExpense(
    { ...state.expenses[0], reference: 'F2', date: '2026-02-30' },
    state,
  ),
);
assert.equal(A.report({ ...state, expenses: [] }, p).expenses.length, 0);
console.log(
  'OK: límites trimestrales/semestrales/anuales, zona Bogotá, no duplicación de traslados, reparaciones, fuentes de costo, filtros, proyección y validaciones.',
);
