/* Reglas puras: pueden ejecutarse también en Node para probar el flujo. */
(function (root) {
  const terminal = ['De baja', 'Vendido', 'Anulado por duplicado'];
  const active = (item) => !terminal.includes(item.Estado_gestion);
  const value = (item) => Number(item.Cantidad) * Number(item.Valor_unitario_COP);
  function available(item) {
    return (
      ['En bodega'].includes(item.Estado_gestion) &&
      ['Bueno', 'Regular'].includes(item.Estado_fisico)
    );
  }

  /** Valida código único, cantidad, valor y agrupación antes de guardar una ficha. */
  function validateItem(item, items, groups, editing) {
    if (!/^EL-[A-Z0-9-]+$/i.test(item.Codigo || ''))
      throw Error('Usa un código EL- seguido de letras o números.');
    if (items.some((x) => x.Codigo === item.Codigo && x !== editing))
      throw Error('El código ya existe.');
    for (const key of ['Elemento', 'Espacio', 'Categoria'])
      if (!String(item[key] || '').trim())
        throw Error('Completa nombre, espacio y categoría.');
    if (!Number.isSafeInteger(item.Cantidad) || item.Cantidad < 1)
      throw Error('La cantidad debe ser un entero mayor que cero.');
    if (
      !Number.isFinite(item.Valor_unitario_COP) ||
      item.Valor_unitario_COP < 0 ||
      item.Valor_unitario_COP > 1e12
    )
      throw Error('El valor debe estar entre 0 y un billón de pesos.');
    if (!Number.isSafeInteger(item.Reparaciones) || item.Reparaciones < 0)
      throw Error('Las reparaciones deben ser un entero no negativo.');
    if (!groups.some((g) => g.Agrupacion_ID === item.Agrupacion_ID))
      throw Error('Selecciona una agrupación válida.');
  }

  /** Crea la solicitud; todavía no cambia la ubicación del elemento. */
  function requestTransfer(state, code, dest, space, actor, reason) {
    const item = state.items.find((x) => x.Codigo === code),
      group = state.groups.find((g) => g.Agrupacion_ID === dest);
    if (!item || !group) throw Error('El elemento o el destino no existe.');
    if (!['Asignado', 'En bodega', 'En lista de saldos'].includes(item.Estado_gestion))
      throw Error('El estado actual no permite solicitar un traslado.');
    if (
      state.transfers.some(
        (t) => t.code === code && ['Solicitado', 'En tránsito'].includes(t.status),
      )
    )
      throw Error('Este elemento ya tiene un traslado pendiente.');
    if (group.Estado === 'Cerrada' || group.Estado === 'Por configurar')
      throw Error('Configura y habilita primero la agrupación de destino.');
    if (dest === item.Agrupacion_ID)
      throw Error('El destino debe ser una agrupación diferente.');
    if (!space.trim() || !reason.trim() || !actor)
      throw Error('Completa espacio, responsable y motivo.');
    const t = {
      id: 'TR-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      code,
      origin: item.Agrupacion_ID,
      dest,
      space: space.trim(),
      actor,
      reason: reason.trim(),
      status: 'Solicitado',
      date: new Date().toISOString(),
    };
    state.transfers.unshift(t);
    return t;
  }

  /** Aplica una transición válida: aprobar, recibir o rechazar. La recepción cambia la ubicación. */
  function advanceTransfer(state, id, action, actor) {
    const t = state.transfers.find((x) => x.id === id);
    if (!t) throw Error('No se encontró el traslado.');
    const item = state.items.find((x) => x.Codigo === t.code);
    if (!item) throw Error('No se encontró el elemento.');
    if (action === 'approve' && t.status === 'Solicitado') {
      if (
        item.Agrupacion_ID !== t.origin ||
        !['Asignado', 'En bodega', 'En lista de saldos'].includes(item.Estado_gestion)
      )
        throw Error('El inventario cambió; revisa la solicitud.');
      t.status = 'En tránsito';
      t.approvedBy = actor;
      t.approvedAt = new Date().toISOString();
      item.Estado_gestion = 'En tránsito';
    } else if (action === 'receive' && t.status === 'En tránsito') {
      const g = state.groups.find((x) => x.Agrupacion_ID === t.dest);
      if (!g || ['Cerrada', 'Por configurar'].includes(g.Estado))
        throw Error('El destino debe estar habilitado antes de recibir.');
      item.Agrupacion_ID = t.dest;
      item.Proyecto_ID = g.Proyecto_ID;
      item.Espacio = t.space;
      item.Estado_gestion = g.Tipo === 'Bodega' ? 'En bodega' : 'Asignado';
      t.status = 'Recibido';
      t.receivedBy = actor;
      t.receivedAt = new Date().toISOString();
    } else if (action === 'reject' && t.status === 'Solicitado') {
      t.status = 'Rechazado';
      t.rejectedBy = actor;
    } else throw Error('La transición solicitada no es válida.');
    return t;
  }
  const api = {
    active,
    value,
    available,
    validateItem,
    requestTransfer,
    advanceTransfer,
  };
  root.InventoryCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
