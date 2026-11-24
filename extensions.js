'use strict';
state.expenses ||= [];
const A = InventoryAnalytics;
let branch = { project: '', group: '', space: null };
const groupTitle = groupDisplayName;

/** Resume los activos de la ubicación seleccionada. */
function currentSummary(items) {
  const active = items.filter(C.active);
  return `${active.length} registros activos · ${active.reduce((s, i) => s + i.Cantidad, 0)} unidades · ${money(active.reduce((s, i) => s + C.value(i), 0))}`;
}

/** Navegación por niveles: proyecto, agrupación, espacio interior y elementos. */
function explorer() {
  const p = state.projects.find((p) => p.Proyecto_ID === branch.project),
    g = group(branch.group);
  const crumbs = [
    ['all', 'Proyectos'],
    ...(p ? [['project', p.Nombre]] : []),
    ...(g ? [['group', groupTitle(g)]] : []),
    ...(branch.space !== null
      ? [['space', branch.space || 'Sin espacio registrado']]
      : []),
  ];
  let html = /* HTML */ `
    <div class="toolbar">
      <nav class="breadcrumbs" aria-label="Ruta de ubicación">
        ${crumbs
          .map(
            ([level, label]) => /* HTML */ `
              <button class="quiet" data-level="${level}">${esc(label)}</button>
            `,
          )
          .join('<span aria-hidden="true">/</span>')}
      </nav>
      <button id="managePlaces" class="outline">
        Administrar proyectos y agrupaciones
      </button>
    </div>
  `;
  if (!p) {
    html +=
      '<p class="sub">Selecciona un proyecto para consultar sus apartamentos modelo, salas de ventas y bodegas.</p><div class="cards">' +
      state.projects
        .map(
          (p) => /* HTML */ `
            <button class="drill-card" data-open-project="${p.Proyecto_ID}">
              <span class="eyebrow">PROYECTO</span>
              <h2>${esc(p.Nombre)}</h2>
              ${badge(p.Etapa)}
              <p>
                ${state.groups.filter((g) => g.Proyecto_ID === p.Proyecto_ID).length}
                agrupaciones
              </p>
              <small>
                ${currentSummary(state.items.filter((i) => i.Proyecto_ID === p.Proyecto_ID))}
              </small>
            </button>
          `,
        )
        .join('') +
      '</div>';
  } else if (!g) {
    const groups = state.groups.filter((g) => g.Proyecto_ID === p.Proyecto_ID);
    html += /* HTML */ `
      <h2>${esc(p.Nombre)}</h2>
      <p class="sub">Elige una agrupación para ver los espacios interiores.</p>
      ${p.Proyecto_ID === 'BOD' ? '<p class="notice">«Bodega» era el nombre de la agrupación interna de Bodega central. Ambos niveles corresponden a la misma ubicación; sus existencias se cuentan una sola vez.</p>' : ''}
      <div class="cards">
        ${groups
          .map((g) => {
            const items = state.items.filter(
              (i) => i.Agrupacion_ID === g.Agrupacion_ID,
            );
            return /* HTML */ `
              <button class="drill-card" data-open-group="${g.Agrupacion_ID}">
                <h3>${esc(groupTitle(g))}</h3>
                ${badge(g.Estado)}
                <p>
                  ${new Set(items.map((i) => i.Espacio || '')).size} espacios interiores
                </p>
                <small>
                  ${esc(person(g.Responsable_ID))}
                  <br />
                  ${currentSummary(items)}
                </small>
              </button>
            `;
          })
          .join('')}
      </div>
      ${!groups.length ? '<p class="empty">Este proyecto aún no tiene agrupaciones.</p>' : ''}
    `;
  } else if (branch.space === null) {
    const items = state.items.filter((i) => i.Agrupacion_ID === g.Agrupacion_ID),
      spaces = [...new Set(items.map((i) => i.Espacio || ''))].sort();
    html += /* HTML */ `
      <h2>${esc(groupTitle(g))}</h2>
      <p class="sub">
        ${esc(p.Nombre)} · ${esc(person(g.Responsable_ID))}. Selecciona sala, cocina,
        comedor u otro espacio.
      </p>
      <div class="cards">
        ${spaces
          .map(
            (space, index) => /* HTML */ `
              <button class="drill-card" data-space-index="${index}">
                <span class="eyebrow">ESPACIO INTERIOR</span>
                <h3>${esc(space || 'Sin espacio registrado')}</h3>
                <small>
                  ${currentSummary(items.filter((i) => (i.Espacio || '') === space))}
                </small>
              </button>
            `,
          )
          .join('')}
      </div>
      ${!spaces.length ? '<div class="panel empty">Esta agrupación todavía no tiene elementos ni espacios registrados. Puedes registrar un elemento indicando esta agrupación y el espacio interior.</div>' : ''}
    `;
  } else {
    const items = state.items.filter(
      (i) => i.Agrupacion_ID === g.Agrupacion_ID && (i.Espacio || '') === branch.space,
    );
    html += /* HTML */ `
      <section class="panel">
        <h2>${esc(branch.space || 'Sin espacio registrado')}</h2>
        <p class="sub">
          ${esc(p.Nombre)} · ${esc(groupTitle(g))}
          <br />
          ${currentSummary(items)}. Se incluyen bajas y ventas, identificadas por su
          situación.
        </p>
        <label>
          Buscar en este espacio
          <input id="roomSearch" placeholder="Nombre, código o categoría" />
        </label>
        <div id="roomRows"></div>
      </section>
    `;
  }
  $('#view').innerHTML = html;
  document.querySelectorAll('[data-level]').forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.level === 'all') branch = { project: '', group: '', space: null };
        if (b.dataset.level === 'project') {
          branch.group = '';
          branch.space = null;
        }
        if (b.dataset.level === 'group') branch.space = null;
        explorer();
      }),
  );
  document.querySelectorAll('[data-open-project]').forEach(
    (b) =>
      (b.onclick = () => {
        branch = { project: b.dataset.openProject, group: '', space: null };
        explorer();
      }),
  );
  document.querySelectorAll('[data-open-group]').forEach(
    (b) =>
      (b.onclick = () => {
        branch.group = b.dataset.openGroup;
        branch.space = null;
        explorer();
      }),
  );
  const spaces = g
    ? [
        ...new Set(
          state.items
            .filter((i) => i.Agrupacion_ID === g.Agrupacion_ID)
            .map((i) => i.Espacio || ''),
        ),
      ].sort()
    : [];
  document.querySelectorAll('[data-space-index]').forEach(
    (b) =>
      (b.onclick = () => {
        branch.space = spaces[Number(b.dataset.spaceIndex)];
        explorer();
      }),
  );
  $('#managePlaces').onclick = () => {
    projects();
    const back = document.createElement('button');
    back.textContent = 'Volver al explorador de espacios';
    back.className = 'outline';
    back.onclick = explorer;
    $('#view').prepend(back);
  };
  if ($('#roomSearch')) {
    const draw = () => {
      const q = $('#roomSearch').value.toLocaleLowerCase('es');
      const items = state.items.filter(
        (i) =>
          i.Agrupacion_ID === branch.group &&
          (i.Espacio || '') === branch.space &&
          [i.Elemento, i.Codigo, i.Categoria]
            .join(' ')
            .toLocaleLowerCase('es')
            .includes(q),
      );
      $('#roomRows').innerHTML = /* HTML */ `
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Elemento</th>
                <th>Categoría</th>
                <th>Estado</th>
                <th>Situación</th>
                <th>Unidades</th>
                <th>Valor total</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (i) => /* HTML */ `
                    <tr>
                      <td>
                        <button class="link" data-item="${esc(i.Codigo)}">
                          ${esc(i.Elemento)}
                        </button>
                        <span class="sub">${esc(i.Codigo)}</span>
                      </td>
                      <td>${esc(i.Categoria)}</td>
                      <td>${badge(i.Estado_fisico)}</td>
                      <td>${badge(i.Estado_gestion)}</td>
                      <td>${i.Cantidad}</td>
                      <td>${money(C.value(i))}</td>
                    </tr>
                  `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
        ${!items.length ? '<p class="empty">No hay elementos con esa búsqueda.</p>' : ''}
      `;
      bindItems();
    };
    $('#roomSearch').oninput = draw;
    draw();
  }
}
const today = A.dateKey(new Date().toISOString());
let analysisFilter = {
  year: Number(today.slice(0, 4)),
  months: 3,
  index: Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1,
  project: '',
};
const metricCards = (values) => /* HTML */ `
  <div class="metrics">
    ${values
      .map(
        ([label, value, note]) => /* HTML */ `
          <div class="metric">
            <span>${label}</span>
            <b>${value}</b>
            <span>${note}</span>
          </div>
        `,
      )
      .join('')}
  </div>
`;
const table = (heads, rows) => /* HTML */ `
  <div class="tablewrap">
    <table>
      <thead>
        <tr>
          ${heads
            .map(
              (h) => /* HTML */ `
                <th>${esc(h)}</th>
              `,
            )
            .join('')}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => /* HTML */ `
              <tr>
                ${row
                  .map(
                    (c) => /* HTML */ `
                      <td>${c}</td>
                    `,
                  )
                  .join('')}
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  </div>
`;

/** Construye los filtros, indicadores, tablas y escenario de proyección. */
function analytics() {
  analysisDrills = [];
  $('#metrics').hidden = true;
  const f = analysisFilter,
    p = A.period(f.year, f.months, f.index),
    r = A.report(state, p, f.project),
    previous = A.report(
      state,
      {
        ...p,
        start: p.previousStart,
        end: p.start,
        year: Number(p.previousStart.slice(0, 4)),
        index: Math.floor((Number(p.previousStart.slice(5, 7)) - 1) / p.months) + 1,
      },
      f.project,
    );
  const context =
    p.start +
    ' a ' +
    new Date(Date.parse(p.end) - 86400000).toISOString().slice(0, 10) +
    ' · ' +
    (state.projects.find((x) => x.Proyecto_ID === f.project)?.Nombre ||
      'Todos los proyectos');
  const previousContext =
    p.previousStart +
    ' a ' +
    new Date(Date.parse(p.start) - 86400000).toISOString().slice(0, 10) +
    ' · periodo anterior';
  const listLink = (label, kind, records, title, note = context) =>
    drillLink(label, { kind, records, title, context: note });
  const categoryRecords = (category) => ({
    repairs: r.repairs.filter(
      (h) => state.items.find((i) => i.Codigo === h.Codigo)?.Categoria === category,
    ),
    buys: r.buys.filter((i) => i.Categoria === category),
    expenses: r.expenses.filter((e) => e.category === category),
  });
  const monthRecords = (month) => ({
    moves: r.moves.filter((h) => A.dateKey(h.Fecha).startsWith(month)),
    repairs: r.repairs.filter((h) => A.dateKey(h.Fecha).startsWith(month)),
    expenses: r.expenses.filter((e) => e.date.startsWith(month)),
  });
  const years = [
    ...new Set([
      Number(today.slice(0, 4)),
      ...state.items.map((i) => Number(i.Fecha_compra?.slice(0, 4))),
      ...state.history.map((h) => Number(h.Fecha?.slice(0, 4))),
      ...state.expenses.map((e) => Number(e.date.slice(0, 4))),
    ]),
  ]
    .filter((n) => n > 2000)
    .sort((a, b) => b - a);
  $('#view').innerHTML = /* HTML */ `
    <div class="toolbar">
      <div>
        <h2>Actividad y costos por periodo</h2>
        <p class="sub">
          Del ${p.start} al
          ${new Date(Date.parse(p.end) - 86400000).toISOString().slice(0, 10)} ·
          ${f.project ? esc(state.projects.find((x) => x.Proyecto_ID === f.project)?.Nombre) : 'Todos los proyectos'}
        </p>
      </div>
      <div class="actions">
        <button id="reportCSV" class="outline">Exportar análisis CSV</button>
        <button id="newExpense">+ Registrar gasto</button>
      </div>
    </div>
    <section class="panel filters">
      ${select('Año', 'year', years.map(String), String(f.year))}${select(
        'Periodo',
        'months',
        [
          ['3', 'Trimestral'],
          ['6', 'Semestral'],
          ['12', 'Anual'],
        ],
        String(f.months),
      )}${select(
        'Bloque',
        'index',
        Array.from({ length: 12 / f.months }, (_, j) => [
          String(j + 1),
          f.months === 12
            ? 'Año completo'
            : `${f.months === 3 ? 'Trimestre' : 'Semestre'} ${j + 1}`,
        ]),
        String(f.index),
      )}${select('Proyecto', 'project', [['', 'Todos los proyectos'], ...state.projects.map((p) => [p.Proyecto_ID, p.Nombre])], f.project)}
    </section>
    <p class="notice">
      Los valores de compra del kit son referencias ficticias. Los gastos solo incluyen
      importes que registres con soporte; un dato faltante no equivale a costo cero.
      ${!r.complete ? 'Este periodo está en curso o es futuro.' : ''}
    </p>
    ${metricCards([
      [
        listLink('Traslados registrados', 'moves', r.moves, 'Traslados del periodo'),
        listLink(r.moves.length, 'moves', r.moves, 'Traslados del periodo'),
        `${r.moves.length - r.legacyMoves} recepciones nuevas · ${r.legacyMoves} movimientos históricos`,
      ],
      [
        listLink(
          'Envíos a reparación',
          'repairs',
          r.repairs,
          'Reparaciones del periodo',
        ),
        listLink(r.repairs.length, 'repairs', r.repairs, 'Reparaciones del periodo'),
        'Eventos del periodo; excluye retornos',
      ],
      [
        listLink('Lotes comprados', 'buys', r.buys, 'Lotes comprados en el periodo'),
        listLink(r.buys.length, 'buys', r.buys, 'Lotes comprados en el periodo'),
        `${r.purchaseUnits} unidades según fecha de compra`,
      ],
      [
        listLink('Gastos registrados', 'expenses', r.expenses, 'Gastos del periodo'),
        listLink(
          r.expenses.length ? money(r.cost) : 'Sin datos',
          'expenses',
          r.expenses,
          'Gastos del periodo',
        ),
        `${r.expenses.length} registros de gasto con importe`,
      ],
    ])}
    <div class="cards">
      <section class="panel">
        <h3>Compras a valor de referencia</h3>
        <p class="amount">
          ${listLink(money(r.purchaseReference), 'buys', r.buys, 'Compras a valor de referencia')}
        </p>
        <p class="sub">
          Cantidad actual × valor unitario de los lotes con fecha de compra en el
          periodo. No equivale a facturas pagadas ni se suma a los gastos registrados.
        </p>
      </section>
      <section class="panel">
        <h3>Comparación con el periodo anterior</h3>
        <p class="sub">
          ${p.previousStart} a
          ${new Date(Date.parse(p.start) - 86400000).toISOString().slice(0, 10)}
        </p>
        ${table(
          ['Indicador', 'Anterior', 'Seleccionado'],
          [
            [
              'Traslados',
              listLink(
                previous.moves.length,
                'moves',
                previous.moves,
                'Traslados del periodo anterior',
                previousContext,
              ),
              listLink(r.moves.length, 'moves', r.moves, 'Traslados del periodo'),
            ],
            [
              'Envíos a reparación',
              listLink(
                previous.repairs.length,
                'repairs',
                previous.repairs,
                'Reparaciones del periodo anterior',
                previousContext,
              ),
              listLink(
                r.repairs.length,
                'repairs',
                r.repairs,
                'Reparaciones del periodo',
              ),
            ],
            [
              'Gastos con importe',
              listLink(
                previous.expenses.length ? money(previous.cost) : 'Sin datos',
                'expenses',
                previous.expenses,
                'Gastos del periodo anterior',
                previousContext,
              ),
              listLink(
                r.expenses.length ? money(r.cost) : 'Sin datos',
                'expenses',
                r.expenses,
                'Gastos del periodo',
              ),
            ],
          ],
        )}
        <small>
          ${!r.complete ? 'Comparación parcial: el periodo seleccionado no ha terminado.' : 'Comparación de periodos completos.'}
          Los gastos dependen de la cobertura del registro.
        </small>
      </section>
    </div>
    <section class="panel" style="margin-top:20px">
      <h2>Costos y reparaciones por categoría</h2>
      <p class="sub">
        Mobiliario, decoración, menaje y demás categorías. Una reparación es un envío
        registrado, no el contador acumulado de la ficha.
      </p>
      ${table(
        [
          'Categoría',
          'Reparaciones',
          'Lotes comprados',
          'Compra de referencia',
          'Gasto registrado',
        ],
        r.categories.map((c) => [
          listLink(
            c.category,
            'category',
            categoryRecords(c.category),
            'Categoría: ' + c.category,
          ),
          listLink(
            c.repairs,
            'repairs',
            categoryRecords(c.category).repairs,
            'Reparaciones · ' + c.category,
          ),
          listLink(
            c.purchases,
            'buys',
            categoryRecords(c.category).buys,
            'Lotes comprados · ' + c.category,
          ),
          listLink(
            money(c.reference),
            'buys',
            categoryRecords(c.category).buys,
            'Compras de referencia · ' + c.category,
          ),
          listLink(
            categoryRecords(c.category).expenses.length ? money(c.cost) : 'Sin datos',
            'expenses',
            categoryRecords(c.category).expenses,
            'Gastos · ' + c.category,
          ),
        ]),
      )}${!r.categories.length ? '<p class="empty">Sin actividad o gastos para este periodo.</p>' : ''}
    </section>
    <section class="panel">
      <h2>Gastos por concepto</h2>
      ${table(
        ['Concepto', 'Registros', 'Importe registrado'],
        ['Compra', 'Reparación', 'Transporte', 'Almacenamiento', 'Otro'].map((type) => {
          const entries = r.expenses.filter((e) => e.type === type);
          return [
            listLink(type, 'expenses', entries, 'Gastos de ' + type),
            listLink(entries.length, 'expenses', entries, 'Gastos de ' + type),
            listLink(
              entries.length
                ? money(entries.reduce((sum, e) => sum + e.amount, 0))
                : 'Sin datos',
              'expenses',
              entries,
              'Gastos de ' + type,
            ),
          ];
        }),
      )}
    </section>
    <section class="panel">
      <h2>Evolución mensual</h2>
      <p class="sub">
        Barras de gastos registrados. La tabla conserva los valores exactos y la
        actividad operativa.
      </p>
      <div class="month-chart">
        ${r.monthly
          .map(
            (m) => /* HTML */ `
              <div class="month-column">
                <span>
                  ${r.expenses.some((e) => e.date.startsWith(m.month)) ? money(m.cost) : 'Sin datos'}
                </span>
                <div class="month-track">
                  <div
                    style="height:${m.cost ? Math.max(2, (m.cost / Math.max(...r.monthly.map((x) => x.cost), 1)) * 100) : 0}%"
                  ></div>
                </div>
                <strong>
                  ${listLink(m.month, 'month', monthRecords(m.month), 'Actividad de ' + m.month)}
                </strong>
              </div>
            `,
          )
          .join('')}
      </div>
      ${table(
        ['Mes', 'Traslados', 'Reparaciones', 'Gasto registrado'],
        r.monthly.map((m) => [
          listLink(m.month, 'month', monthRecords(m.month), 'Actividad de ' + m.month),
          listLink(
            m.moves,
            'moves',
            monthRecords(m.month).moves,
            'Traslados · ' + m.month,
          ),
          listLink(
            m.repairs,
            'repairs',
            monthRecords(m.month).repairs,
            'Reparaciones · ' + m.month,
          ),
          listLink(
            monthRecords(m.month).expenses.length ? money(m.cost) : 'Sin datos',
            'expenses',
            monthRecords(m.month).expenses,
            'Gastos · ' + m.month,
          ),
        ]),
      )}
    </section>
    <section class="panel">
      <h2>Escenario de gasto futuro</h2>
      <p class="sub">
        Extrapolación simple de los gastos registrados en el periodo seleccionado. No es
        una predicción: supone el mismo ritmo diario y cobertura completa. No incluye
        inflación automática ni compras pendientes.
      </p>
      <div class="formgrid">
        ${select(
          'Horizonte de proyección',
          'horizon',
          [
            ['3', 'Próximos 3 meses'],
            ['6', 'Próximos 6 meses'],
            ['12', 'Próximos 12 meses'],
          ],
          '3',
        )}${input('Ajuste esperado (%)', 'adjustment', 0, 'number', 'min="-100" max="500" step="1"')}
      </div>
      <div id="projection" class="projection" aria-live="polite"></div>
    </section>
    <section class="panel">
      <h2>Gastos con soporte registrado</h2>
      <p class="sub">
        Compras, reparaciones, transporte, almacenamiento y otros. Una factura se
        registra una sola vez; no se genera automáticamente desde el inventario.
      </p>
      ${table(
        ['Fecha', 'Tipo / categoría', 'Proyecto', 'Importe', 'Soporte / concepto'],
        r.expenses.map((e) => [
          esc(e.date),
          `${esc(e.type)}<span class="sub">${esc(e.category)}</span>`,
          esc(e.project),
          money(e.amount),
          `${listLink(e.reference, 'expenses', [e], 'Gasto: ' + e.reference)}<span class="sub">${esc(e.note)}</span>`,
        ]),
      )}${!r.expenses.length ? '<p class="empty">No hay gastos documentados en este periodo. Registra un gasto para comenzar.</p>' : ''}
    </section>
    <section class="panel">
      <h2>Oportunidades y datos por completar</h2>
      <p class="sub">
        La siguiente información es del inventario actual, no una reconstrucción del
        cierre del periodo.
      </p>
      ${opportunities(f.project)}
      <details>
        <summary>Cómo se calculan los indicadores</summary>
        <p>
          Traslados: movimientos históricos «Traslado» y «Envío a bodega», más
          «Recepción confirmada» de la demo. Solicitudes y despachos no se cuentan otra
          vez. Los históricos no prueban recepción ni número de viajes: cada fila
          corresponde a un movimiento de un código.
        </p>
        <p>
          Reparaciones: eventos «Envío a reparación» del historial; el contador
          Reparaciones de la ficha es acumulado y no permite ubicar intervenciones sin
          fecha.
        </p>
        <p>
          Compras: lotes con Fecha_compra en el periodo, incluyendo los dados de baja y
          vendidos; se excluyen anulados por duplicado. No mide número de órdenes de
          compra. La categoría y la asignación de proyecto de estas compras son las
          actuales.
        </p>
        <p>
          Movimientos y reparaciones por proyecto: se atribuyen por agrupación de origen
          o destino registrada. Un traslado entre proyectos aparece en ambos al
          filtrarlos, pero solo una vez en el total general. La categoría del evento
          proviene de la ficha actual.
        </p>
        <p>
          Gastos: fecha, proyecto, categoría e importe del registro de gasto. Son
          independientes de las estimaciones de compra. ${r.excluded} eventos del
          periodo sin un código válido se excluyen de los conteos
          operativos.${f.project ? ` Hay ${r.unlocated} eventos sin proyecto histórico identificable; no se imputan a este filtro.` : ''}
        </p>
      </details>
    </section>
  `;
  for (const key of ['year', 'months', 'index', 'project'])
    document.querySelector(`[name="${key}"]`).onchange = (e) => {
      analysisFilter[key] = key === 'project' ? e.target.value : Number(e.target.value);
      if (key === 'months') analysisFilter.index = 1;
      analytics();
    };
  $('#newExpense').onclick = expenseForm;
  const projectCost = () => {
    const months = Number(document.querySelector('[name="horizon"]').value),
      adjust = Number(document.querySelector('[name="adjustment"]').value);
    const value = A.projection(r.cost, r.elapsed, months, adjust);
    $('#projection').innerHTML =
      !r.expenses.length || value === null
        ? '<strong>Sin base para proyectar.</strong><p>Registra gastos en un periodo con días transcurridos.</p>'
        : !Number.isFinite(adjust) || adjust < -100 || adjust > 500
          ? '<p>El ajuste debe estar entre −100% y 500%.</p>'
          : /* HTML */ `
              <strong>${money(value)}</strong>
              <p class="sub">
                ${money(r.cost)} ÷ ${r.elapsed} días ×
                ${((365.25 / 12) * months).toFixed(2)} días futuros ×
                ${(1 + adjust / 100).toFixed(2)}. Horizonte: ${months} meses; ajuste:
                ${adjust}%.
              </p>
            `;
  };
  document.querySelector('[name="horizon"]').onchange = projectCost;
  document.querySelector('[name="adjustment"]').oninput = projectCost;
  projectCost();
  bindAnalysisLinks();
  $('#reportCSV').onclick = () => {
    const rows = [
      ['Análisis de inventario', p.start, p.end + ' (exclusivo)', f.project || 'Todos'],
      [
        'Tipo',
        'Categoría / mes',
        'Reparaciones',
        'Lotes comprados',
        'Compra referencia COP',
        'Gasto registrado COP',
      ],
      ...r.categories.map((c) => [
        'Categoría',
        c.category,
        c.repairs,
        c.purchases,
        c.reference,
        r.expenses.some((e) => e.category === c.category) ? c.cost : 'Sin datos',
      ]),
      [],
      ['Mes', 'Traslados', 'Reparaciones', 'Gasto registrado COP'],
      ...r.monthly.map((m) => [
        m.month,
        m.moves,
        m.repairs,
        r.expenses.some((e) => e.date.startsWith(m.month)) ? m.cost : 'Sin datos',
      ]),
      [],
      [
        'Los valores de compra son referencias. Los gastos incluyen solo registros con importe.',
      ],
      [
        'Compras por proyecto/categoría actuales. Movimientos por origen o destino histórico.',
      ],
    ];
    const safe = (v) =>
      '"' + String(/^[=+@-]/.test(String(v)) ? "'" + v : v).replace(/"/g, '""') + '"';
    download(
      'analisis-' + p.start + '.csv',
      '\uFEFF' + rows.map((row) => row.map(safe).join(';')).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  };
}

/** Muestra señales del inventario actual, no del cierre histórico del periodo. */
function opportunities(project) {
  const items = state.items.filter(
      (i) => C.active(i) && (!project || i.Proyecto_ID === project),
    ),
    available = items.filter(C.available),
    damaged = items.filter((i) => i.Estado_fisico === 'Dañado'),
    balances = items.filter((i) => i.Estado_gestion === 'En lista de saldos'),
    repeat = items
      .filter((i) => i.Reparaciones >= 2)
      .sort((a, b) => b.Reparaciones - a.Reparaciones);
  return (
    table(
      [
        'Señal actual',
        'Registros',
        'Valor de referencia',
        'Decisión que ayuda a revisar',
      ],
      [
        [
          drillLink('Disponibles en bodega', {
            kind: 'items',
            records: available,
            title: 'Disponibles en bodega',
            context: 'Inventario actual',
          }),
          available.length,
          money(available.reduce((s, i) => s + C.value(i), 0)),
          'Reutilizar antes de comprar',
        ],
        [
          drillLink('Dañados activos', {
            kind: 'items',
            records: damaged,
            title: 'Elementos dañados activos',
            context: 'Inventario actual',
          }),
          damaged.length,
          money(damaged.reduce((s, i) => s + C.value(i), 0)),
          'Cotizar reparación frente a reposición',
        ],
        [
          drillLink('En saldos', {
            kind: 'items',
            records: balances,
            title: 'Elementos en saldos',
            context: 'Inventario actual',
          }),
          balances.length,
          money(balances.reduce((s, i) => s + C.value(i), 0)),
          'Evaluar salida; no es ingreso esperado',
        ],
        [
          drillLink('Dos o más reparaciones acumuladas', {
            kind: 'items',
            records: repeat,
            title: 'Reparaciones recurrentes',
            context: 'Inventario actual; no limitado al periodo',
          }),
          repeat.length,
          money(repeat.reduce((s, i) => s + C.value(i), 0)),
          'Revisar vida útil y costo de mantenimiento',
        ],
      ],
    ) +
    /* HTML */ `
      <p class="sub">
        ${items.filter((i) => !i.Fecha_compra).length} registros activos sin fecha de
        compra no pueden ubicarse en un periodo. Los valores disponibles no son ahorros
        realizados.
      </p>
    `
  );
}

/** Registra un gasto documentado. No crea compras ni movimientos de inventario. */
function expenseForm() {
  dialog(
    'Registrar gasto',
    /* HTML */ `
      <form id="form">
        <div class="formgrid">
          ${input('Fecha del gasto', 'date', today, 'date', 'required')}${select('Tipo de gasto', 'type', ['Compra', 'Reparación', 'Transporte', 'Almacenamiento', 'Otro'])}${select(
            'Proyecto al que se imputa',
            'project',
            state.projects.map((p) => [p.Proyecto_ID, p.Nombre]),
            analysisFilter.project,
          )}${select('Categoría', 'category', [...new Set(state.items.map((i) => i.Categoria))].sort().concat('General / varias'))}${input('Importe pagado o causado (COP)', 'amount', '', 'number', 'required min="1" max="1000000000000" step="1"')}${input('Factura o soporte y línea (único por tipo y proyecto)', 'reference', '', 'text', 'required maxlength="150"')}
          <label class="full">
            Concepto
            <textarea name="note" required maxlength="1000"></textarea>
          </label>
        </div>
        <p class="sub">
          Registra una sola vez el total de cada gasto. Si una factura tiene varias
          categorías, divide sus líneas sin duplicar el total. Registrar un gasto no
          modifica existencias ni genera movimientos.
        </p>
        ${submit('Guardar gasto')}
      </form>
    `,
  );
  bindForm((d) => {
    const e = {
      ...d,
      amount: Number(d.amount),
      reference: d.reference.trim(),
      id: 'G-' + Date.now(),
      actor: actor(),
      createdAt: new Date().toISOString(),
    };
    A.validateExpense(e, state);
    state.expenses.push(e);
    record(e.id, 'Registro de gasto', e.project, e.project, e.note, null, e);
    commit(
      'Gasto guardado. Selecciona el periodo de su fecha para verlo en el análisis.',
    );
  });
}
routes.proyectos[1] = explorer;
routes.analisis = ['Análisis y costos', analytics];
const originalMetrics = metrics;
metrics = function () {
  $('#metrics').hidden = false;
  originalMetrics();
};
render();
