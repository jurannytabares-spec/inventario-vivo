'use strict';

// Los desgloses utilizan exactamente los registros que produjeron el indicador.
// No recalculan un total con otros filtros al abrir la ventana.
let analysisDrills = [];

function enableDialogReturn(callback, label) {
  const button = $('#backToItem');
  button.hidden = false;
  button.textContent = label;
  button.title = label;
  button.onclick = callback;
}

function historyItemName(movement) {
  return (
    state.items.find((i) => i.Codigo === movement.Codigo)?.Elemento ||
    movement.Despues?.Elemento ||
    movement.Antes?.Elemento ||
    (movement.Tipo === 'Registro de gasto'
      ? 'Registro de gasto'
      : 'Sin elemento vinculado')
  );
}

function itemLink(code, fallback = '') {
  const item = state.items.find((i) => i.Codigo === code);
  return item
    ? /* HTML */ `
        <button type="button" class="link" data-item="${esc(code)}">
          ${esc(item.Elemento)}
        </button>
        <span class="sub">${esc(code)}</span>
      `
    : /* HTML */ `
        <span>${esc(fallback || 'Sin ficha vinculada')}</span>
        <span class="sub">${esc(code || 'Sin código')}</span>
      `;
}

function historyElement(movement) {
  return itemLink(movement.Codigo, historyItemName(movement));
}

/** Cada enlace conserva su tipo de listado, registros y descripción de filtros. */
function drillLink(label, spec) {
  const index = analysisDrills.push(spec) - 1;
  return /* HTML */ `
    <button
      type="button"
      class="link drill-link"
      data-analysis="${index}"
      title="Ver registros: ${esc(spec.title)}"
    >
      ${esc(label)}
    </button>
  `;
}

function bindAnalysisLinks() {
  document.querySelectorAll('[data-analysis]').forEach((button) => {
    const spec = analysisDrills[Number(button.dataset.analysis)];
    button.onclick = () => openAnalysisDetail(spec);
  });
}

function analysisItemsTable(items) {
  return table(
    [
      'Elemento',
      'Categoría',
      'Ubicación actual',
      'Compra',
      'Unidades',
      'Valor referencia',
    ],
    items.map((i) => [
      itemLink(i.Codigo),
      esc(i.Categoria),
      `${esc(groupName(i.Agrupacion_ID))}<span class="sub">${esc(i.Espacio)}</span>`,
      esc(i.Fecha_compra?.slice(0, 10) || 'Sin fecha'),
      i.Cantidad,
      money(C.value(i)),
    ]),
  );
}

function analysisExpensesTable(expenses) {
  return table(
    [
      'Fecha',
      'Tipo / categoría',
      'Proyecto',
      'Importe',
      'Soporte / concepto',
      'Registra',
    ],
    expenses.map((e) => [
      esc(e.date),
      `${esc(e.type)}<span class="sub">${esc(e.category)}</span>`,
      esc(state.projects.find((p) => p.Proyecto_ID === e.project)?.Nombre || e.project),
      money(e.amount),
      `${esc(e.reference)}<span class="sub">${esc(e.note)}</span>`,
      esc(person(e.actor)),
    ]),
  );
}

/** Categorías y meses permiten alternar entre compras, reparaciones y gastos. */
function openAnalysisDetail(spec, selected = '', search = '') {
  const groups =
    spec.kind === 'category' || spec.kind === 'month'
      ? spec.records
      : { [spec.kind]: spec.records };
  const names = {
    moves: 'Traslados',
    repairs: 'Reparaciones',
    buys: 'Lotes comprados',
    expenses: 'Gastos',
    items: 'Elementos',
  };
  const keys = Object.keys(groups);
  const key = selected || keys.find((k) => groups[k].length) || keys[0];
  const all = groups[key] || [];
  dialog(
    spec.title,
    /* HTML */ `
      <p class="sub">${esc(spec.context || '')}</p>
      <div class="actions" role="group" aria-label="Tipo de registros">
        ${keys
          .map(
            (k) => /* HTML */ `
              <button
                type="button"
                class="${k === key ? '' : 'outline'}"
                data-drill-tab="${k}"
                aria-pressed="${k === key}"
              >
                ${names[k]} (${groups[k].length})
              </button>
            `,
          )
          .join('')}
      </div>
      <label class="drill-search">
        Buscar dentro del listado
        <input
          id="drillSearch"
          value="${esc(search)}"
          placeholder="Nombre, código o concepto"
        />
      </label>
      <p id="drillCount" class="sub"></p>
      <div id="drillRows"></div>
    `,
  );
  const draw = () => {
    const query = $('#drillSearch').value.trim().toLocaleLowerCase('es');
    const rows = all.filter((record) =>
      [JSON.stringify(record), historyItemName(record)]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(query),
    );
    $('#drillCount').textContent =
      `${rows.length} de ${all.length} registros. ${key === 'expenses' ? 'Importe visible: ' + money(rows.reduce((sum, e) => sum + e.amount, 0)) : ''}`;
    $('#drillRows').innerHTML = !rows.length
      ? '<p class="empty">No hay registros para esta selección.</p>'
      : key === 'expenses'
        ? analysisExpensesTable(rows)
        : ['items', 'buys'].includes(key)
          ? analysisItemsTable(rows)
          : historyTable(rows);
    const savedSearch = $('#drillSearch').value;
    bindItems(() => openAnalysisDetail(spec, key, savedSearch), $('#drillRows'));
  };
  document.querySelectorAll('[data-drill-tab]').forEach((button) => {
    button.onclick = () => openAnalysisDetail(spec, button.dataset.drillTab);
  });
  $('#drillSearch').oninput = draw;
  draw();
}

// Estado de la vista; se conserva al cerrar una ficha o registrar un conteo.
let verificationFilter = {
  project: '',
  group: '',
  mode: 'inventory',
  search: '',
  page: 1,
};

/** Inventario actual y conteos históricos se muestran por separado. */
function verificationWorkspace() {
  const f = verificationFilter;
  const groups = state.groups.filter((g) => !f.project || g.Proyecto_ID === f.project);
  $('#view').innerHTML = /* HTML */ `
    <section class="panel">
      <h2>Verificación por proyecto y espacio</h2>
      <p class="sub">
        Consulta cualquier proyecto o bodega, abre la ficha y registra un conteo. Los
        elementos sin evidencia aparecen como «Sin conteo registrado».
      </p>
      <div class="filters">
        ${select('Proyecto a verificar', 'verifyProject', [['', 'Todos los proyectos'], ...state.projects.map((p) => [p.Proyecto_ID, p.Nombre])], f.project)}
        ${select('Agrupación a verificar', 'verifyGroup', [['', 'Todas las agrupaciones'], ...groups.map((g) => [g.Agrupacion_ID, groupName(g.Agrupacion_ID)])], f.group)}
        <label>
          Buscar elemento
          <input
            id="verifySearch"
            placeholder="Nombre, código o espacio"
            value="${esc(f.search)}"
          />
        </label>
      </div>
      <div class="actions" role="group" aria-label="Vista de verificación">
        <button
          data-verify-mode="inventory"
          class="${f.mode === 'inventory' ? '' : 'outline'}"
          aria-pressed="${f.mode === 'inventory'}"
        >
          Inventario por verificar
        </button>
        <button
          data-verify-mode="records"
          class="${f.mode === 'records' ? '' : 'outline'}"
          aria-pressed="${f.mode === 'records'}"
        >
          Conteos registrados
        </button>
      </div>
      <div id="verificationRows"></div>
    </section>
    <section class="panel">
      <details>
        <summary>Alertas de revisión de datos</summary>
        <p class="sub">
          Señales de calidad del inventario actual. No son resultados de un conteo.
        </p>
        <div id="verificationIssues"></div>
      </details>
    </section>
  `;
  document.querySelector('[name="verifyProject"]').onchange = (e) => {
    f.project = e.target.value;
    f.group = '';
    f.page = 1;
    verificationWorkspace();
  };
  document.querySelector('[name="verifyGroup"]').onchange = (e) => {
    f.group = e.target.value;
    f.page = 1;
    drawVerification();
  };
  $('#verifySearch').oninput = (e) => {
    f.search = e.target.value;
    f.page = 1;
    drawVerification();
  };
  document.querySelectorAll('[data-verify-mode]').forEach(
    (button) =>
      (button.onclick = () => {
        f.mode = button.dataset.verifyMode;
        f.page = 1;
        verificationWorkspace();
      }),
  );
  drawVerification();
}

function drawVerification() {
  const f = verificationFilter;
  const checks = InventoryAnalytics.verificationRecords(state);
  const query = f.search.trim().toLocaleLowerCase('es');
  let rows;
  if (f.mode === 'inventory') {
    rows = state.items.filter(
      (i) =>
        C.active(i) &&
        (!f.project || i.Proyecto_ID === f.project) &&
        (!f.group || i.Agrupacion_ID === f.group) &&
        [i.Codigo, i.Elemento, i.Espacio]
          .join(' ')
          .toLocaleLowerCase('es')
          .includes(query),
    );
  } else {
    rows = checks.filter(
      (a) =>
        (!f.project || a.projectId === f.project) &&
        (!f.group || a.groupId === f.group) &&
        [a.code, a.element, a.space, a.location]
          .join(' ')
          .toLocaleLowerCase('es')
          .includes(query),
    );
  }
  const pages = Math.max(1, Math.ceil(rows.length / 20));
  f.page = Math.min(f.page, pages);
  const visible = rows.slice((f.page - 1) * 20, f.page * 20);
  const intro =
    f.mode === 'inventory'
      ? 'Existencias activas actuales. El último conteo mostrado corresponde a esta agrupación; no significa que la cantidad actual haya sido verificada hoy.'
      : 'Evidencia histórica: el kit solo contiene conteos de AGR-C-AM1 del 5 de noviembre de 2026. Los demás conteos se registran desde las fichas. Las verificaciones mantienen su ubicación original aunque el elemento se traslade.';
  let markup;
  if (f.mode === 'inventory') {
    markup = table(
      [
        'Elemento',
        'Ubicación actual',
        'Cantidad actual',
        'Último conteo aquí',
        'Acción',
      ],
      visible.map((i) => {
        const latest = checks.find(
          (a) => a.code === i.Codigo && a.groupId === i.Agrupacion_ID,
        );
        return [
          itemLink(i.Codigo),
          `${esc(groupName(i.Agrupacion_ID))}<span class="sub">${esc(i.Espacio)}</span>`,
          i.Cantidad,
          latest
            ? `${esc(InventoryAnalytics.dateKey(latest.date))}<span class="sub">Encontrados: ${latest.found}; registrados entonces: ${latest.recorded}</span>`
            : 'Sin conteo registrado',
          `<button class="quiet" data-count-item="${esc(i.Codigo)}">Registrar conteo</button>`,
        ];
      }),
    );
  } else {
    markup = table(
      [
        'Fecha / fuente',
        'Elemento',
        'Ubicación del conteo',
        'Registrado / encontrado',
        'Diferencia',
        'Estado / observación',
        'Registra',
      ],
      visible.map((a) => [
        `${esc(InventoryAnalytics.dateKey(a.date))}<span class="sub">${esc(a.source)}</span>`,
        itemLink(a.code, a.element),
        `${esc(a.groupId ? groupName(a.groupId) : 'Ubicación histórica no identificada')}<span class="sub">${esc(a.space || a.location || '')}</span>`,
        `${a.recorded} / ${a.found}`,
        a.difference,
        `${esc(a.physical)}<span class="sub">${esc(a.note)}</span>`,
        esc(person(a.actor)),
      ]),
    );
  }
  $('#verificationRows').innerHTML =
    `<p class="sub drill-search">${intro}</p>${markup}${!rows.length ? '<p class="empty">No hay registros con estos filtros. Usa «Inventario por verificar» para iniciar un conteo en este proyecto.</p>' : ''}<div class="pager"><span>${rows.length} registros · página ${f.page} de ${pages}</span><div class="actions"><button id="verifyPrev" class="quiet" ${f.page === 1 ? 'disabled' : ''}>Anterior</button><button id="verifyNext" class="quiet" ${f.page === pages ? 'disabled' : ''}>Siguiente</button></div></div>`;
  $('#verifyPrev').onclick = () => {
    f.page--;
    drawVerification();
  };
  $('#verifyNext').onclick = () => {
    f.page++;
    drawVerification();
  };
  bindItems(null, $('#verificationRows'));
  const issues = quality().filter(([code]) => {
    const item = state.items.find((i) => i.Codigo === code);
    return (
      (!f.project || item?.Proyecto_ID === f.project) &&
      (!f.group || item?.Agrupacion_ID === f.group)
    );
  });
  $('#verificationIssues').innerHTML = issues.length
    ? table(
        ['Elemento / referencia', 'Revisión necesaria'],
        issues.map(([code, note]) => [itemLink(code, code), esc(note)]),
      )
    : '<p class="sub">Sin alertas detectadas con estos filtros.</p>';
  bindItems(null, $('#verificationIssues'));
  document.querySelectorAll('[data-count-item]').forEach(
    (button) =>
      (button.onclick = () => {
        const item = state.items.find((i) => i.Codigo === button.dataset.countItem);
        detail(item.Codigo);
        checkForm(item);
      }),
  );
}
