'use strict';
// UTILIDADES: consulta del DOM, moneda y escape seguro de texto.
const $ = (s) => document.querySelector(s),
  C = InventoryCore,
  KEY = 'conaltura-inventario-vivo-v1';
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const money = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);
const number = (n) => new Intl.NumberFormat('es-CO').format(n);
const stamp = (s) =>
  s ? new Date(String(s).replace(' ', 'T')).toLocaleString('es-CO') : 'Sin fecha';
// ESTADO: datos iniciales y recuperación de cambios guardados en el navegador.
const fresh = () => ({
  ...structuredClone(SEED),
  transfers: [],
  audits: [],
  version: 1,
});
let state = fresh(),
  loadError = '';
try {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (
      parsed.version !== 1 ||
      ![
        'items',
        'projects',
        'groups',
        'people',
        'history',
        'checks',
        'transfers',
        'audits',
      ].every((k) => Array.isArray(parsed[k]))
    )
      throw Error();
    state = parsed;
  }
} catch {
  loadError =
    'No se pudo cargar el guardado local. Se muestra el kit original. Descarga un respaldo antes de cerrar si el navegador bloquea el almacenamiento.';
}
let page = 1,
  filters = { search: '', project: '', status: '', category: '' };
const group = (id) => state.groups.find((g) => g.Agrupacion_ID === id);
const person = (id) =>
  state.people.find((p) => p.Responsable_ID === id)?.['Cargo de referencia'] ||
  id ||
  'Sin asignar';
// BOD es la ubicación principal; AGR-BOD es su agrupación, no otra bodega.
const groupDisplayName = (g) =>
  g.Agrupacion_ID === 'AGR-BOD' && g.Proyecto_ID === 'BOD'
    ? 'Bodega central'
    : g.Tipo === 'Bodega'
      ? 'Bodega del ' +
        (state.projects.find((p) => p.Proyecto_ID === g.Proyecto_ID)?.Nombre ||
          g.Proyecto_ID)
      : g.Tipo + (g.Tipologia && g.Tipologia !== '—' ? ' · ' + g.Tipologia : '');
const groupName = (id) => {
  const g = group(id);
  return g ? `${groupDisplayName(g)} (${g.Agrupacion_ID})` : id;
};
const actor = () => $('#actor').value;
const options = (list, selected = '') =>
  list
    .map((x) => {
      const [v, label] = Array.isArray(x) ? x : [x, x];
      return /* HTML */ `
        <option value="${esc(v)}" ${v === selected ? 'selected' : ''}>
          ${esc(label)}
        </option>
      `;
    })
    .join('');
// Un estado siempre muestra texto además del color.
const badge = (status) => {
  let tone = '';

  if (['Bueno', 'En bodega', 'Recibido', 'Activa'].includes(status)) {
    tone = 'good';
  } else if (['Dañado', 'De baja', 'Rechazado'].includes(status)) {
    tone = 'bad';
  } else if (
    ['En tránsito', 'En reparación', 'Solicitado', 'En cierre'].includes(status)
  ) {
    tone = 'warn';
  }

  return /* HTML */ `
    <span class="badge ${tone}">${esc(status)}</span>
  `;
};

/** Muestra una confirmación o un error sin interrumpir el trabajo. */
function notify(message, error = false) {
  $('#status').className = error ? 'error' : 'success';
  $('#status').textContent = message;
}

/** Guarda el estado en este navegador. Si falla, solicita descargar un respaldo. */
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    notify(
      'No se pudo guardar en este navegador. Los cambios siguen en memoria: descarga el respaldo JSON antes de cerrar.',
      true,
    );
    return false;
  }
}

/** Añade un movimiento y copia los valores anteriores/nuevos para conservar la historia. */
function record(code, type, origin, dest, reason, before = null, after = null) {
  state.history.unshift({
    Mov_ID: 'LOCAL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    Fecha: new Date().toISOString(),
    Codigo: code,
    Tipo: type,
    Origen: origin,
    Destino: dest,
    'Registra (Responsable_ID)': actor(),
    Motivo: reason,
    Antes: before === null ? null : structuredClone(before),
    Despues: after === null ? null : structuredClone(after),
  });
}

/** Completa una edición: guarda, cierra el formulario y actualiza la pantalla. */
function commit(message) {
  const ok = save();
  $('#dialog').close();
  render();
  if (ok) notify(message);
}

/** Abre la ventana reutilizable de fichas y formularios. */
function dialog(title, html) {
  // Cada pantalla decide si ofrece regreso. Así no se conserva otro elemento.
  $('#backToItem').hidden = true;
  $('#backToItem').textContent = 'Volver a la ficha';
  $('#backToItem').title = 'Volver al mismo elemento sin guardar este formulario';
  $('#backToItem').onclick = null;
  $('#dialogTitle').textContent = title;
  $('#dialogBody').innerHTML = html + '<div id="formError" role="alert"></div>';
  if (!$('#dialog').open) $('#dialog').showModal();
}

/** Regresa al elemento sin guardar el formulario ni cerrar la ventana modal. */
let itemReturnContext = null;

function enableItemReturn(code, actionId) {
  const returnToList = itemReturnContext;
  const backButton = $('#backToItem');
  backButton.hidden = false;
  backButton.onclick = () => {
    // detail vuelve a leer los datos guardados; los campos sin enviar se descartan.
    detail(code, returnToList);
    document.getElementById(actionId)?.focus();
  };
}
function fail(e) {
  $('#formError').className = 'error';
  $('#formError').textContent = e.message;
}

/** Convierte los campos del formulario a un objeto y muestra errores de validación. */
function bindForm(fn) {
  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      fn(Object.fromEntries(new FormData(e.currentTarget)));
    } catch (error) {
      fail(error);
    }
  });
}
const input = (label, name, value = '', type = 'text', extra = '') => /* HTML */ `
  <label>
    ${esc(label)}
    <input name="${name}" type="${type}" value="${esc(value)}" ${extra} />
  </label>
`;
const select = (label, name, list, value = '') => /* HTML */ `
  <label>
    ${esc(label)}
    <select name="${name}">
      ${options(list, value)}
    </select>
  </label>
`;
const reason = () =>
  '<label class="full">Motivo / observaciones<textarea name="reason" required maxlength="1000"></textarea></label>';
const submit = (text = 'Guardar') => /* HTML */ `
  <div class="form-actions"><button type="submit">${text}</button></div>
`;

/** Calcula el resumen global a partir del inventario vigente. */
function metrics() {
  const active = state.items.filter(C.active),
    available = active.filter(C.available);
  $('#metrics').innerHTML = [
    [
      'Registros activos',
      number(active.length),
      `${number(active.reduce((s, x) => s + x.Cantidad, 0))} unidades · excluye bajas y ventas`,
    ],
    [
      'Valor activo',
      money(active.reduce((s, x) => s + C.value(x), 0)),
      'Referencia de compra · no valor contable',
    ],
    ['Disponibles en bodega', number(available.length), 'Registros buenos o regulares'],
    [
      'Traslados pendientes',
      number(
        state.transfers.filter((t) => ['Solicitado', 'En tránsito'].includes(t.status))
          .length,
      ),
      'Solicitados y en tránsito en esta demo',
    ],
  ]
    .map(
      ([label, val, note]) => /* HTML */ `
        <div class="metric">
          <span>${label}</span>
          <b>${val}</b>
          <span>${note}</span>
        </div>
      `,
    )
    .join('');
}
// NAVEGACIÓN: cada ruta tiene un título y una función que dibuja su contenido.
const routes = {
  inventario: ['Inventario', inventory],
  proyectos: ['Proyectos y espacios', projects],
  traslados: ['Traslados', transfers],
  historial: ['Historial', history],
  verificacion: ['Verificación física', verification],
};

/** Elige la sección según la dirección #inventario, #proyectos, etc. */
function render() {
  const route =
    location.hash.slice(1) in routes ? location.hash.slice(1) : 'inventario';
  $('#title').textContent = routes[route][0];
  document
    .querySelectorAll('nav a')
    .forEach((a) => a.classList.toggle('active', a.hash === '#' + route));
  metrics();
  routes[route][1]();
}

/** Aplica conjuntamente búsqueda, proyecto, categoría y situación. */
function filtered() {
  const query = filters.search.trim().toLocaleLowerCase('es');
  return state.items.filter(
    (i) =>
      (!query ||
        [i.Codigo, i.Elemento, i.Espacio, i.Agrupacion_ID, i.Observaciones]
          .join(' ')
          .toLocaleLowerCase('es')
          .includes(query)) &&
      (!filters.project || i.Proyecto_ID === filters.project) &&
      (!filters.category || i.Categoria === filters.category) &&
      (!filters.status ||
        (filters.status === 'disponible'
          ? C.available(i)
          : filters.status === 'cierre'
            ? C.active(i) && group(i.Agrupacion_ID)?.Estado === 'En cierre'
            : i.Estado_gestion === filters.status)),
  );
}

/** Construye la pantalla de inventario y conecta sus filtros y botones. */
function inventory() {
  $('#view').innerHTML = /* HTML */ `
    <section class="panel">
      <div class="toolbar">
        <div>
          <h2>Todos los elementos</h2>
          <p class="sub">
            Consulta ubicación, estado y disponibilidad antes de comprar.
          </p>
        </div>
        <div class="actions">
          <button id="csv" class="outline">Exportar vista CSV</button>
          <button id="new">+ Registrar elemento</button>
        </div>
      </div>
      <div class="filters">
        <label>
          Buscar
          <input
            id="search"
            placeholder="Código, nombre, espacio…"
            value="${esc(filters.search)}"
          />
        </label>
        <label>
          Proyecto
          <select id="project">
            ${options([['', 'Todos los proyectos'], ...state.projects.map((p) => [p.Proyecto_ID, p.Nombre])], filters.project)}
          </select>
        </label>
        <label>
          Situación
          <select id="filterStatus">
            ${options([['', 'Todas las situaciones'], ['disponible', 'Disponibles en bodega'], ['cierre', 'En espacios en cierre'], ...new Set(state.items.map((i) => i.Estado_gestion))], filters.status)}
          </select>
        </label>
        <label>
          Categoría
          <select id="category">
            ${options([['', 'Todas las categorías'], ...[...new Set(state.items.map((i) => i.Categoria))].sort()], filters.category)}
          </select>
        </label>
      </div>
      <div id="results"></div>
    </section>
  `;
  for (const [id, key] of [
    ['search', 'search'],
    ['project', 'project'],
    ['filterStatus', 'status'],
    ['category', 'category'],
  ])
    $('#' + id).addEventListener(id === 'search' ? 'input' : 'change', (e) => {
      filters[key] = e.target.value;
      page = 1;
      rows();
    });
  $('#new').onclick = () => itemForm();
  $('#csv').onclick = exportCSV;
  rows();
}

/** Muestra veinte registros por página. Cambiar de página no modifica los datos. */
function rows() {
  const list = filtered(),
    pages = Math.max(1, Math.ceil(list.length / 20));
  page = Math.min(page, pages);
  $('#results').innerHTML = /* HTML */ `
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Ubicación</th>
            <th>Estado físico</th>
            <th>Situación</th>
            <th class="num">Unidades</th>
            <th class="num">Valor total</th>
          </tr>
        </thead>
        <tbody>
          ${list
            .slice((page - 1) * 20, page * 20)
            .map(
              (i) => /* HTML */ `
                <tr>
                  <td>
                    <button class="link" data-item="${esc(i.Codigo)}">
                      ${esc(i.Elemento)}
                    </button>
                    <span class="sub">${esc(i.Codigo)} · ${esc(i.Categoria)}</span>
                  </td>
                  <td>
                    ${esc(i.Agrupacion_ID)}
                    <span class="sub">${esc(i.Espacio)}</span>
                  </td>
                  <td>${badge(i.Estado_fisico)}</td>
                  <td>${badge(i.Estado_gestion)}</td>
                  <td class="num">${i.Cantidad}</td>
                  <td class="num">${money(C.value(i))}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    </div>
    ${!list.length ? '<div class="empty">No hay elementos con estos filtros.</div>' : ''}
    <div class="pager">
      <span>${number(list.length)} registros · página ${page} de ${pages}</span>
      <div class="actions">
        <button class="quiet" id="prev" ${page === 1 ? 'disabled' : ''}>
          Anterior
        </button>
        <button class="quiet" id="next" ${page === pages ? 'disabled' : ''}>
          Siguiente
        </button>
      </div>
    </div>
  `;
  $('#prev').onclick = () => {
    page--;
    rows();
  };
  $('#next').onclick = () => {
    page++;
    rows();
  };
  bindItems();
}

/** Permite abrir la ficha pulsando el nombre de cualquier elemento visible. */
function bindItems(returnTo = null, container = document) {
  container
    .querySelectorAll('[data-item]')
    .forEach((b) => (b.onclick = () => detail(b.dataset.item, returnTo)));
}

/** Presenta la ficha, sus acciones disponibles y su historial. */
function detail(code, returnTo = null) {
  itemReturnContext = returnTo;
  const i = state.items.find((x) => x.Codigo === code);
  if (!i) return;
  const g = group(i.Agrupacion_ID),
    pending = state.transfers.some(
      (t) => t.code === code && ['Solicitado', 'En tránsito'].includes(t.status),
    );
  dialog(
    i.Elemento,
    /* HTML */ `
      <p class="sub">${esc(code)} · ${esc(groupName(i.Agrupacion_ID))}</p>
      <div class="actions">${badge(i.Estado_gestion)}${badge(i.Estado_fisico)}</div>
      <div class="detailgrid">
        ${[
          ['Espacio', i.Espacio],
          ['Categoría', i.Categoria],
          ['Cantidad', i.Cantidad],
          ['Valor unitario', money(i.Valor_unitario_COP)],
          ['Valor total', money(C.value(i))],
          ['Responsable actual', person(g?.Responsable_ID)],
          ['Fecha de compra', i.Fecha_compra?.slice(0, 10) || 'Sin registrar'],
          ['Proveedor', i.Proveedor || 'Sin registrar'],
          ['Reparaciones', i.Reparaciones],
        ]
          .map(
            ([k, v]) => /* HTML */ `
              <div>
                <span>${k}</span>
                <b>${esc(v)}</b>
              </div>
            `,
          )
          .join('')}
      </div>
      <p>${esc(i.Observaciones || 'Sin observaciones.')}</p>
      <div class="actions">
        <button
          id="editItem"
          class="outline"
          ${!C.active(i) || pending ? 'disabled' : ''}
        >
          Editar ficha
        </button>
        <button
          id="transferItem"
          ${!['Asignado', 'En bodega', 'En lista de saldos'].includes(i.Estado_gestion) || pending ? 'disabled' : ''}
        >
          Solicitar traslado
        </button>
        <button
          id="eventItem"
          class="outline"
          ${!C.active(i) || pending || i.Estado_gestion === 'En tránsito' ? 'disabled' : ''}
        >
          Registrar novedad
        </button>
        <button id="verifyItem" class="outline">Verificar físicamente</button>
      </div>
      <h3 style="margin-top:24px">Historia del elemento</h3>
      ${historyTable(state.history.filter((h) => h.Codigo === code))}
    `,
  );
  if (returnTo) enableDialogReturn(returnTo, 'Volver al listado');
  bindItems(returnTo, $('#dialogBody'));
  $('#editItem').onclick = () => itemForm(i);
  $('#transferItem').onclick = () => transferForm(i);
  $('#eventItem').onclick = () => eventForm(i);
  $('#verifyItem').onclick = () => checkForm(i);
}

/** Sirve para crear o editar. Los cambios de ubicación se hacen mediante traslados. */
function itemForm(existing) {
  const i = existing || {
    Codigo:
      'EL-' +
      String(
        Math.max(0, ...state.items.map((x) => Number(x.Codigo.slice(3)) || 0)) + 1,
      ).padStart(5, '0'),
    Cantidad: 1,
    Valor_unitario_COP: 0,
    Reparaciones: 0,
    Estado_fisico: 'Bueno',
    Estado_gestion: 'Asignado',
    Agrupacion_ID: state.groups[0].Agrupacion_ID,
  };
  dialog(
    existing ? 'Editar ficha' : 'Registrar elemento',
    /* HTML */ `
      <form id="form">
        <div class="formgrid">
          ${input('Código único', 'Codigo', i.Codigo, 'text', `required maxlength="50" ${existing ? 'readonly' : ''}`)}
          ${input('Nombre del elemento', 'Elemento', i.Elemento, 'text', 'required maxlength="150"')}
          ${
            existing
              ? /* HTML */ `
                  <div>
                    <label>Agrupación</label>
                    <p>
                      ${esc(i.Agrupacion_ID)}
                      <br />
                      <small>Usa un traslado para cambiarla.</small>
                    </p>
                  </div>
                `
              : select(
                  'Agrupación',
                  'Agrupacion_ID',
                  state.groups
                    .filter((g) => !['Cerrada', 'Por configurar'].includes(g.Estado))
                    .map((g) => [g.Agrupacion_ID, groupName(g.Agrupacion_ID)]),
                  i.Agrupacion_ID,
                )
          }
          ${input('Espacio o estantería', 'Espacio', i.Espacio, 'text', 'required maxlength="100"')}
          ${select('Categoría', 'Categoria', [...new Set(state.items.map((x) => x.Categoria))].sort(), i.Categoria)}
          ${input('Cantidad (lote completo)', 'Cantidad', i.Cantidad, 'number', 'min="1" step="1" required')}
          ${input('Valor unitario COP', 'Valor_unitario_COP', i.Valor_unitario_COP, 'number', 'min="0" max="1000000000000" step="1" required')}
          ${input('Fecha de compra', 'Fecha_compra', i.Fecha_compra?.slice(0, 10), 'date')}
          ${input('Proveedor', 'Proveedor', i.Proveedor, 'text', 'maxlength="150"')}
          ${
            existing
              ? /* HTML */ `
                  <div>
                    <label>Estado físico / gestión</label>
                    <p>
                      ${esc(i.Estado_fisico)} / ${esc(i.Estado_gestion)}
                      <br />
                      <small>Usa una novedad para cambiar el estado.</small>
                    </p>
                  </div>
                `
              : select(
                  'Estado físico',
                  'Estado_fisico',
                  ['Bueno', 'Regular', 'Dañado', 'N/A'],
                  i.Estado_fisico,
                )
          }
          ${!existing ? select('Situación inicial', 'Estado_gestion', ['Asignado', 'En bodega', 'Pendiente de llegada'], i.Estado_gestion) : ''}
          <label class="full">
            Observaciones
            <textarea name="Observaciones" maxlength="2000">
${esc(i.Observaciones)}</textarea>
          </label>
          ${existing ? reason() : ''}
        </div>
        ${submit()}
      </form>
    `,
  );
  if (existing) enableItemReturn(existing.Codigo, 'editItem');

  bindForm((data) => {
    const before = existing ? structuredClone(existing) : null,
      next = {
        ...i,
        ...data,
        Cantidad: Number(data.Cantidad),
        Valor_unitario_COP: Number(data.Valor_unitario_COP),
        Reparaciones: i.Reparaciones || 0,
      };
    delete next.reason;
    next.Codigo = next.Codigo.trim().toUpperCase();
    next.Elemento = next.Elemento.trim();
    next.Espacio = next.Espacio.trim();
    next.Proyecto_ID = group(next.Agrupacion_ID).Proyecto_ID;
    next.Valor_total_COP = C.value(next);
    C.validateItem(next, state.items, state.groups, existing);
    if (
      next.Estado_gestion === 'En bodega' &&
      group(next.Agrupacion_ID).Tipo !== 'Bodega'
    )
      throw Error('El estado En bodega requiere una agrupación de tipo Bodega.');
    if (existing) Object.assign(existing, next);
    else state.items.push(next);
    record(
      next.Codigo,
      existing ? 'Edición de ficha' : 'Ingreso por compra',
      existing?.Agrupacion_ID || next.Proveedor,
      next.Agrupacion_ID,
      data.reason || 'Registro inicial',
      before,
      next,
    );
    commit('Ficha guardada e historial actualizado.');
  });
}

/** Crea una solicitud para trasladar el lote completo a otra agrupación. */
function transferForm(i) {
  dialog(
    'Solicitar traslado',
    /* HTML */ `
      <p>${esc(i.Codigo)} · ${esc(i.Elemento)} · ${i.Cantidad} unidades</p>
      <p class="sub">
        Se traslada el lote completo. La ubicación actual se conserva hasta confirmar
        recepción.
      </p>
      <form id="form">
        <div class="formgrid">
          ${select(
            'Agrupación de destino',
            'dest',
            state.groups
              .filter((g) => g.Agrupacion_ID !== i.Agrupacion_ID)
              .map((g) => [g.Agrupacion_ID, groupName(g.Agrupacion_ID)]),
          )}${input('Espacio o estantería en destino', 'space', '', 'text', 'required maxlength="100"')}${reason()}
        </div>
        ${submit('Crear solicitud')}
      </form>
    `,
  );
  enableItemReturn(i.Codigo, 'transferItem');

  bindForm((data) => {
    const t = C.requestTransfer(
      state,
      i.Codigo,
      data.dest,
      data.space,
      actor(),
      data.reason,
    );
    record(i.Codigo, 'Solicitud de traslado', t.origin, t.dest, t.reason);
    commit('Solicitud creada. Continúa desde la sección Traslados.');
  });
}

/** Muestra solicitudes y conecta aprobación, rechazo y recepción. */
/** Botones según la etapa del traslado; no cambia las reglas de autorización. */
function transferActions(transfer) {
  if (transfer.status === 'Solicitado') {
    return /* HTML */ `
      <button data-transfer="${transfer.id}" data-action="approve">
        Aprobar y despachar
      </button>
      <button class="outline" data-transfer="${transfer.id}" data-action="reject">
        Rechazar
      </button>
    `;
  }

  if (transfer.status === 'En tránsito') {
    return /* HTML */ `
      <button data-transfer="${transfer.id}" data-action="receive">
        Confirmar recepción
      </button>
    `;
  }

  const responsible = transfer.receivedBy
    ? 'Recibe: ' + person(transfer.receivedBy)
    : transfer.rejectedBy
      ? 'Rechaza: ' + person(transfer.rejectedBy)
      : '';

  return /* HTML */ `
    <span class="sub">${esc(responsible)}</span>
  `;
}

function transfers() {
  $('#view').innerHTML = /* HTML */ `
    <section class="panel">
      <div class="toolbar">
        <div>
          <h2>Entregas y recepciones</h2>
          <p class="sub">
            Selecciona un elemento del inventario para iniciar una solicitud.
          </p>
        </div>
      </div>
      ${
        state.transfers.length
          ? state.transfers
              .map(
                (t) => /* HTML */ `
                  <div class="group">
                    <div class="toolbar">
                      <div>
                        <strong>
                          ${esc(t.code)} ·
                          ${esc(state.items.find((i) => i.Codigo === t.code)?.Elemento)}
                        </strong>
                        <span class="sub">
                          ${esc(t.origin)} a ${esc(t.dest)} · ${esc(t.space)}
                        </span>
                      </div>
                      ${badge(t.status)}
                    </div>
                    <p class="sub">
                      Solicita ${esc(person(t.actor))} · ${stamp(t.date)}
                      <br />
                      ${esc(t.reason)}
                    </p>
                    <div class="actions">${transferActions(t)}</div>
                  </div>
                `,
              )
              .join('')
          : '<div class="empty">Todavía no hay solicitudes creadas en esta demo. Los movimientos históricos del kit se consultan en Historial.</div>'
      }
    </section>
  `;
  document.querySelectorAll('[data-transfer]').forEach(
    (b) =>
      (b.onclick = () => {
        try {
          const t = C.advanceTransfer(
            state,
            b.dataset.transfer,
            b.dataset.action,
            actor(),
          );
          record(
            t.code,
            {
              approve: 'Despacho aprobado',
              receive: 'Recepción confirmada',
              reject: 'Traslado rechazado',
            }[b.dataset.action],
            t.origin,
            t.dest,
            t.reason,
          );
          commit('Traslado actualizado: ' + t.status + '.');
        } catch (e) {
          notify(e.message, true);
        }
      }),
  );
}

/** Registra daños, reparaciones, bajas y otras novedades sin borrar su historia. */
function eventForm(i) {
  const ops = [
    'Reporte de daño',
    'Reporte de pérdida',
    'Paso a lista de saldos',
    'Baja',
    'Anular duplicado',
  ];
  if (i.Estado_gestion === 'En reparación') ops.push('Retorno de reparación');
  else ops.push('Envío a reparación');
  if (i.Estado_gestion === 'En lista de saldos') ops.push('Venta');
  if (i.Estado_gestion === 'Pendiente de llegada') ops.push('Confirmar llegada');
  dialog(
    'Registrar novedad',
    /* HTML */ `
      <p>${esc(i.Codigo)} · ${esc(i.Elemento)}</p>
      <form id="form">
        <div class="formgrid">
          ${select('Tipo de novedad', 'type', ops)}${input('Referencia del soporte (acta, foto o documento)', 'support', '', 'text', 'required maxlength="250"')}${reason()}
        </div>
        <p class="sub">
          La baja y la venta excluyen el lote completo del valor activo. El soporte se
          registra como referencia; este prototipo no adjunta archivos ni valida
          aprobaciones.
        </p>
        ${submit('Registrar novedad')}
      </form>
    `,
  );
  enableItemReturn(i.Codigo, 'eventItem');

  bindForm((d) => {
    const before = structuredClone(i);
    if (d.type === 'Reporte de daño') i.Estado_fisico = 'Dañado';
    if (d.type === 'Reporte de pérdida') i.Estado_gestion = 'Por localizar';
    if (d.type === 'Envío a reparación') {
      i.Estado_gestion = 'En reparación';
      i.Reparaciones++;
    }
    if (['Retorno de reparación', 'Confirmar llegada'].includes(d.type)) {
      i.Estado_fisico = 'Bueno';
      i.Estado_gestion =
        group(i.Agrupacion_ID)?.Tipo === 'Bodega' ? 'En bodega' : 'Asignado';
    }
    if (d.type === 'Paso a lista de saldos') i.Estado_gestion = 'En lista de saldos';
    if (d.type === 'Baja') i.Estado_gestion = 'De baja';
    if (d.type === 'Venta') i.Estado_gestion = 'Vendido';
    if (d.type === 'Anular duplicado') i.Estado_gestion = 'Anulado por duplicado';
    record(
      i.Codigo,
      d.type,
      i.Agrupacion_ID,
      i.Agrupacion_ID,
      d.reason + ' · Soporte: ' + d.support,
      before,
      structuredClone(i),
    );
    commit('Novedad registrada. La historia del elemento se conserva.');
  });
}

/** Pantalla administrativa de proyectos. El explorador está en extensions.js. */
function projects() {
  const total = state.items.filter(C.active).reduce((s, i) => s + C.value(i), 0);
  $('#view').innerHTML = /* HTML */ `
    <div class="toolbar">
      <p class="sub">
        Proyecto, agrupación y espacio interior. Los responsables se asignan por
        agrupación.
      </p>
      <button id="newGroup">+ Crear agrupación</button>
    </div>
    <div class="cards">
      ${state.projects
        .map((p) => {
          const items = state.items.filter(
              (i) => i.Proyecto_ID === p.Proyecto_ID && C.active(i),
            ),
            value = items.reduce((s, i) => s + C.value(i), 0);
          return /* HTML */ `
            <section class="panel">
              <div class="toolbar">
                <h2>${esc(p.Nombre)}</h2>
                <button class="quiet" data-project="${p.Proyecto_ID}">
                  Editar etapa
                </button>
              </div>
              ${badge(p.Etapa)}
              <h3 style="margin:16px 0 0">${money(value)}</h3>
              <div class="bar">
                <span style="width:${total ? (value / total) * 100 : 0}%"></span>
              </div>
              <p class="sub">
                ${items.length} registros activos ·
                ${items.reduce((s, i) => s + i.Cantidad, 0)} unidades
              </p>
              ${state.groups
                .filter((g) => g.Proyecto_ID === p.Proyecto_ID)
                .map((g) => {
                  const gi = items.filter((i) => i.Agrupacion_ID === g.Agrupacion_ID);
                  return /* HTML */ `
                    <div class="group">
                      <strong>${esc(groupDisplayName(g))}</strong>
                      <p class="sub">
                        ${esc(g.Agrupacion_ID)} · ${esc(person(g.Responsable_ID))}
                      </p>
                      <div class="toolbar">
                        ${badge(g.Estado)}
                        <button class="quiet" data-group="${g.Agrupacion_ID}">
                          Configurar
                        </button>
                      </div>
                      <p class="sub">
                        ${gi.length} registros ·
                        ${money(gi.reduce((s, i) => s + C.value(i), 0))}
                        <br />
                        Espacios:
                        ${esc([...new Set(gi.map((i) => i.Espacio))].join(', ') || 'Sin elementos todavía')}
                      </p>
                    </div>
                  `;
                })
                .join('')}
            </section>
          `;
        })
        .join('')}
    </div>
  `;
  $('#newGroup').onclick = () => groupForm();
  document
    .querySelectorAll('[data-group]')
    .forEach((b) => (b.onclick = () => groupForm(group(b.dataset.group))));
  document.querySelectorAll('[data-project]').forEach(
    (b) =>
      (b.onclick = () => {
        const p = state.projects.find((x) => x.Proyecto_ID === b.dataset.project);
        dialog(
          'Etapa de ' + p.Nombre,
          /* HTML */ `
            <form id="form">
              ${select('Etapa', 'stage', ['En venta', 'En cierre', 'En lanzamiento', 'Permanente'], p.Etapa)}${reason()}${submit()}
            </form>
          `,
        );
        bindForm((d) => {
          const before = structuredClone(p);
          p.Etapa = d.stage;
          record(
            p.Proyecto_ID,
            'Cambio de etapa',
            before.Etapa,
            p.Etapa,
            d.reason,
            before,
            structuredClone(p),
          );
          commit('Etapa del proyecto actualizada.');
        });
      }),
  );
}

/** Crea o configura agrupaciones y registra el cambio de responsable. */
function groupForm(g) {
  dialog(
    g ? 'Configurar agrupación' : 'Crear agrupación',
    /* HTML */ `
      <form id="form">
        <div class="formgrid">
          ${input('Código de agrupación', 'id', g?.Agrupacion_ID, 'text', `required pattern="AGR-[A-Za-z0-9-]+" ${g ? 'readonly' : ''}`)}${
            g
              ? /* HTML */ `
                  <p>Proyecto: ${esc(g.Proyecto_ID)}</p>
                `
              : select(
                  'Proyecto',
                  'project',
                  state.projects.map((p) => [p.Proyecto_ID, p.Nombre]),
                )
          }${
            g
              ? /* HTML */ `
                  <p>Tipo: ${esc(g.Tipo)}</p>
                `
              : select('Tipo', 'type', [
                  'Apartamento modelo',
                  'Sala de ventas',
                  'Bodega',
                ])
          }${input('Tipología (si aplica)', 'typology', g?.Tipologia || '—', 'text', 'required maxlength="80"')}${select('Estado', 'status', ['Por configurar', 'En montaje', 'Activa', 'En cierre', 'Cerrada'], g?.Estado || 'En montaje')}${select(
            'Responsable',
            'person',
            state.people.map((p) => [p.Responsable_ID, person(p.Responsable_ID)]),
            g?.Responsable_ID,
          )}${reason()}
        </div>
        ${submit()}
      </form>
    `,
  );
  bindForm((d) => {
    const id = d.id.trim().toUpperCase();
    if (!g && state.groups.some((x) => x.Agrupacion_ID === id))
      throw Error('Ya existe una agrupación con ese código.');
    if (
      ['Cerrada', 'Por configurar'].includes(d.status) &&
      (state.items.some((i) => i.Agrupacion_ID === id && C.active(i)) ||
        state.transfers.some(
          (t) =>
            (t.origin === id || t.dest === id) &&
            ['Solicitado', 'En tránsito'].includes(t.status),
        ))
    )
      throw Error(
        'No puedes cerrar o desconfigurar una agrupación con activos o traslados pendientes.',
      );
    const before = g ? structuredClone(g) : null,
      next = {
        ...(g || {}),
        Agrupacion_ID: id,
        Proyecto_ID: g?.Proyecto_ID || d.project,
        Tipo: g?.Tipo || d.type,
        Tipologia: d.typology,
        Estado: d.status,
        Responsable_ID: d.person,
      };
    if (g) Object.assign(g, next);
    else state.groups.push(next);
    record(
      id,
      g ? 'Configuración de agrupación' : 'Creación de agrupación',
      g?.Proyecto_ID || d.project,
      id,
      d.reason,
      before,
      next,
    );
    commit('Agrupación guardada con responsable e historial.');
  });
}

/** Genera una tabla de movimientos ordenada de más reciente a más antiguo. */
function historyTable(list) {
  return list.length
    ? /* HTML */ `
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Fecha / elemento</th>
                <th>Movimiento</th>
                <th>Origen / destino</th>
                <th>Registra</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              ${[...list]
                .sort((a, b) => String(b.Fecha).localeCompare(String(a.Fecha)))
                .map(
                  (h) => /* HTML */ `
                    <tr>
                      <td>${esc(stamp(h.Fecha))} ${historyElement(h)}</td>
                      <td>${esc(h.Tipo)}</td>
                      <td>
                        ${esc(h.Origen)}
                        <span class="sub">${esc(h.Destino)}</span>
                      </td>
                      <td>
                        ${esc(person(h['Registra (Responsable_ID)']))}
                        <span class="sub">${esc(h['Registra (Responsable_ID)'])}</span>
                      </td>
                      <td style="white-space:normal;min-width:220px">
                        ${esc(h.Motivo)}${
                          h.Antes
                            ? /* HTML */ `
                                <details>
                                  <summary>Ver cambio</summary>
                                  <pre style="white-space:pre-wrap;font-size:12px">
${esc(JSON.stringify({ antes: h.Antes, despues: h.Despues }, null, 2))}</pre>
                                </details>
                              `
                            : ''
                        }
                      </td>
                    </tr>
                  `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
    : '<p class="sub">No hay movimientos registrados.</p>';
}

/** Consulta y filtra el historial completo. */
function history() {
  $('#view').innerHTML = /* HTML */ `
    <section class="panel">
      <div class="toolbar">
        <h2>Registro de actividad</h2>
        <label>
          Buscar nombre, código, tipo o motivo
          <input id="historySearch" placeholder="Alacena, EL-00001, traslado…" />
        </label>
      </div>
      <p class="sub">
        Incluye los ${SEED.history.length} movimientos del kit y los registrados aquí.
        Algunos movimientos de origen no identifican correctamente el elemento.
      </p>
      <div id="historyResults"></div>
    </section>
  `;
  const draw = () => {
    const q = $('#historySearch').value.toLowerCase();
    $('#historyResults').innerHTML = historyTable(
      state.history.filter((h) =>
        [
          historyItemName(h),
          h.Antes?.Elemento,
          h.Despues?.Elemento,
          h.Codigo,
          h.Tipo,
          h.Motivo,
          h.Origen,
          h.Destino,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      ),
    );
  };
  $('#historySearch').oninput = draw;
  $('#historyResults').addEventListener('click', (e) => {
    const button = e.target.closest('[data-item]');
    if (button) detail(button.dataset.item);
  });
  draw();
}

/** Registra el conteo físico como evidencia; no cambia existencias automáticamente. */
function checkForm(i) {
  dialog(
    'Verificar físicamente',
    /* HTML */ `
      <p>${esc(i.Codigo)} · ${esc(i.Elemento)} · registrado: ${i.Cantidad}</p>
      <form id="form">
        <div class="formgrid">
          ${input('Cantidad encontrada', 'count', i.Cantidad, 'number', 'required min="0" step="1"')}${select('Estado encontrado', 'physical', ['Bueno', 'Regular', 'Dañado', 'No localizado'], i.Estado_fisico)}${input('Ubicación observada', 'location', i.Agrupacion_ID + ' / ' + i.Espacio, 'text', 'required maxlength="200"')}${reason()}
        </div>
        <p class="sub">
          El conteo se conserva como evidencia; no modifica automáticamente existencias
          ni ubicación.
        </p>
        ${submit('Registrar verificación')}
      </form>
    `,
  );
  enableItemReturn(i.Codigo, 'verifyItem');

  bindForm((d) => {
    const count = Number(d.count);
    if (!Number.isSafeInteger(count) || count < 0)
      throw Error('La cantidad debe ser un entero no negativo.');
    const audit = {
      code: i.Codigo,
      projectId: i.Proyecto_ID,
      groupId: i.Agrupacion_ID,
      space: i.Espacio,
      element: i.Elemento,
      recorded: i.Cantidad,
      found: count,
      difference: count - i.Cantidad,
      physical: d.physical,
      location: d.location,
      note: d.reason,
      date: new Date().toISOString(),
      actor: actor(),
    };
    state.audits.unshift(audit);
    record(
      i.Codigo,
      'Verificación física',
      i.Agrupacion_ID,
      d.location,
      `${count} encontrados de ${i.Cantidad}. ${d.reason}`,
      null,
      audit,
    );
    commit('Verificación registrada sin alterar el inventario.');
  });
}

/** Detecta señales básicas de inconsistencia para revisión humana. */
function quality() {
  const notes = [];
  const codes = new Set(state.items.map((i) => i.Codigo));
  state.items.forEach((i) => {
    if (!group(i.Agrupacion_ID)) notes.push([i.Codigo, 'Agrupación no encontrada']);
    if (i.Proyecto_ID !== group(i.Agrupacion_ID)?.Proyecto_ID)
      notes.push([i.Codigo, 'Proyecto y agrupación no coinciden']);
    if (i.Estado_fisico === 'Dañado' && i.Estado_gestion === 'Asignado')
      notes.push([i.Codigo, 'Asignado con daño: revisar']);
    if (
      i.Estado_gestion === 'En tránsito' &&
      !state.transfers.some((t) => t.code === i.Codigo && t.status === 'En tránsito')
    )
      notes.push([i.Codigo, 'Tránsito del kit sin solicitud gestionada en esta demo']);
    if (!i.Proveedor) notes.push([i.Codigo, 'Proveedor sin registrar']);
  });
  state.history
    .filter((h) => !codes.has(h.Codigo) && !String(h.Mov_ID).startsWith('LOCAL-'))
    .forEach((h) =>
      notes.push([
        h.Mov_ID,
        'Movimiento sin código de inventario válido: ' + (h.Codigo || 'vacío'),
      ]),
    );
  return notes;
}

/** Muestra la verificación del kit, los conteos nuevos y las alertas. */
function verification() {
  verificationWorkspace();
}

/** Crea una descarga local en memoria y libera su URL temporal. */
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Exporta únicamente la vista filtrada; protege texto que Excel podría ejecutar. */
function exportCSV() {
  const fields = [
    'Codigo',
    'Proyecto_ID',
    'Agrupacion_ID',
    'Espacio',
    'Elemento',
    'Categoria',
    'Cantidad',
    'Estado_fisico',
    'Estado_gestion',
    'Valor_unitario_COP',
    'Valor_total_COP',
  ];
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  download(
    'inventario-filtrado.csv',
    '\uFEFF' +
      [
        fields,
        ...filtered().map((i) =>
          fields.map((f) => (f === 'Valor_total_COP' ? C.value(i) : i[f])),
        ),
      ]
        .map((row) => row.map(cell).join(';'))
        .join('\r\n'),
    'text/csv;charset=utf-8',
  );
}
$('#actor').innerHTML = options(
  state.people.map((p) => [
    p.Responsable_ID,
    p.Responsable_ID + ' · ' + person(p.Responsable_ID),
  ]),
  'RESP-06',
);
$('#backup').onclick = () =>
  download(
    'inventario-vivo-respaldo.json',
    JSON.stringify(state, null, 2),
    'application/json',
  );
$('#close').onclick = () => $('#dialog').close();
window.addEventListener('hashchange', () => {
  page = 1;
  render();
});
window.addEventListener('storage', (e) => {
  if (e.key === KEY)
    notify(
      'Se detectó un cambio en otra pestaña. Recarga esta página antes de editar para evitar sobrescribirlo.',
      true,
    );
});
// La primera vista se dibuja al terminar de cargar extensions.js.
if (loadError) notify(loadError, true);
