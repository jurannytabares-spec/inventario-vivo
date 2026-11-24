/* Cálculos de periodos y fuentes, independientes de la interfaz. */
(function (root) {
  const day = 86400000;

  /** Normaliza fechas a AAAA-MM-DD. Los sellos de tiempo se interpretan en horario de Bogotá. */
  function dateKey(value) {
    if (!value) return '';
    if (String(value).includes('T') && /[Zz]|[+-]\d\d:\d\d$/.test(value))
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(value));
    return String(value).slice(0, 10);
  }

  /** Genera el inicio de un mes; también resuelve cruces entre años. */
  function iso(y, m, d = 1) {
    return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  }

  /** Calcula el intervalo seleccionado y el anterior. El límite final es exclusivo. */
  function period(year, months, index) {
    const startMonth = (index - 1) * months;
    return {
      start: iso(year, startMonth),
      end: iso(year, startMonth + months),
      previousStart: iso(year, startMonth - months),
      months,
      year,
      index,
    };
  }

  /** Comprueba inicio incluido y final excluido, evitando duplicar eventos en dos periodos. */
  function inside(date, start, end) {
    const key = dateKey(date);
    return key >= start && key < end;
  }

  /** Construye los indicadores sin modificar los datos. Separa compras estimadas de gastos registrados. */
  function report(state, p, project = '', now = new Date()) {
    const items = new Map(state.items.map((i) => [i.Codigo, i]));
    const groups = new Map(state.groups.map((g) => [g.Agrupacion_ID, g]));
    const events = state.history.filter((h) => inside(h.Fecha, p.start, p.end));
    const belongs = (h) =>
      !project ||
      [
        groups.get(h.Origen)?.Proyecto_ID,
        groups.get(h.Destino)?.Proyecto_ID,
        h.Despues?.Proyecto_ID,
      ].includes(project);
    const selected = events.filter(belongs),
      valid = selected.filter((h) => items.has(h.Codigo));
    const moves = valid.filter((h) =>
      ['Traslado', 'Envío a bodega', 'Recepción confirmada'].includes(h.Tipo),
    );
    const repairs = valid.filter((h) => h.Tipo === 'Envío a reparación');
    const buys = state.items.filter(
      (i) =>
        i.Estado_gestion !== 'Anulado por duplicado' &&
        inside(i.Fecha_compra, p.start, p.end) &&
        (!project || i.Proyecto_ID === project),
    );
    const expenses = (state.expenses || []).filter(
      (e) => inside(e.date, p.start, p.end) && (!project || e.project === project),
    );
    const sum = (list) => list.reduce((a, e) => a + e.amount, 0);
    const cats = [
      ...new Set([
        ...buys.map((i) => i.Categoria),
        ...repairs.map((h) => items.get(h.Codigo).Categoria),
        ...expenses.map((e) => e.category),
      ]),
    ].sort();
    const categories = cats.map((category) => ({
      category,
      repairs: repairs.filter((h) => items.get(h.Codigo).Categoria === category).length,
      purchases: buys.filter((i) => i.Categoria === category).length,
      reference: buys
        .filter((i) => i.Categoria === category)
        .reduce((a, i) => a + i.Cantidad * i.Valor_unitario_COP, 0),
      cost: sum(expenses.filter((e) => e.category === category)),
    }));
    const monthly = Array.from({ length: p.months }, (_, j) => {
      const start = iso(p.year, (p.index - 1) * p.months + j),
        end = iso(p.year, (p.index - 1) * p.months + j + 1);
      return {
        month: start.slice(0, 7),
        cost: sum(expenses.filter((e) => inside(e.date, start, end))),
        moves: moves.filter((h) => inside(h.Fecha, start, end)).length,
        repairs: repairs.filter((h) => inside(h.Fecha, start, end)).length,
      };
    });
    const today = dateKey(now.toISOString()),
      elapsed = Math.max(
        0,
        (Math.min(Date.parse(p.end), Date.parse(today) + day) - Date.parse(p.start)) /
          day,
      );
    return {
      moves,
      repairs,
      buys,
      expenses,
      categories,
      monthly,
      cost: sum(expenses),
      purchaseReference: buys.reduce(
        (s, i) => s + i.Cantidad * i.Valor_unitario_COP,
        0,
      ),
      purchaseUnits: buys.reduce((s, i) => s + i.Cantidad, 0),
      legacyMoves: moves.filter((h) => h.Tipo !== 'Recepción confirmada').length,
      excluded: selected.filter((h) => !items.has(h.Codigo)).length,
      unlocated: project
        ? events.filter(
            (h) =>
              !groups.has(h.Origen) &&
              !groups.has(h.Destino) &&
              !h.Despues?.Proyecto_ID,
          ).length
        : 0,
      elapsed,
      complete: p.end <= today,
    };
  }

  /** Extrapola el ritmo diario registrado; no modela inflación ni estacionalidad. */
  function projection(cost, elapsed, months, adjustment) {
    if (!(elapsed > 0) || !Number.isFinite(cost) || months <= 0 || adjustment < -100)
      return null;
    return (cost / elapsed) * (365.25 / 12) * months * (1 + adjustment / 100);
  }

  /** Rechaza fechas futuras, importes inválidos y referencias duplicadas. */
  function validateExpense(e, state) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
      Number.isNaN(Date.parse(e.date)) ||
      new Date(e.date).toISOString().slice(0, 10) !== e.date
    )
      throw Error('Fecha inválida.');
    if (e.date > dateKey(new Date().toISOString()))
      throw Error('Registra gastos ocurridos, no fechas futuras.');
    if (!Number.isFinite(e.amount) || e.amount <= 0 || e.amount > 1e12)
      throw Error('El gasto debe ser mayor que cero y no superar un billón.');
    if (!state.projects.some((p) => p.Proyecto_ID === e.project))
      throw Error('Proyecto inválido.');
    if (!e.category?.trim() || !e.reference?.trim())
      throw Error('Completa categoría y referencia del soporte.');
    if (
      (state.expenses || []).some(
        (x) =>
          x.reference.toLowerCase() === e.reference.toLowerCase() &&
          x.type === e.type &&
          x.project === e.project,
      )
    )
      throw Error(
        'Ya existe un gasto de ese tipo y proyecto con la misma referencia. Usa una referencia por factura y línea.',
      );
  }
  /** Conserva la ubicación del conteo, aunque el elemento se traslade después. */
  function verificationRecords(state) {
    const seed = state.checks.map((c, index) => ({
      id: 'KIT-' + index,
      source: 'Kit histórico',
      date: '2026-11-05',
      projectId: 'PRY-C',
      groupId: 'AGR-C-AM1',
      code: c.Codigo,
      element: c.Elemento,
      space: c.Espacio,
      recorded: c.Cantidad_registrada,
      found: c.Cantidad_encontrada,
      difference: c.Cantidad_encontrada - c.Cantidad_registrada,
      physical: c.Estado_encontrado,
      note: c.Observacion || '',
      actor: 'No registrado en el kit',
    }));
    const audits = state.audits.map((a, index) => {
      const movement = state.history.find(
        (h) =>
          h.Tipo === 'Verificación física' &&
          h.Codigo === a.code &&
          (h.Despues?.date === a.date || h.Fecha === a.date),
      );
      const locationGroup = state.groups.find(
        (g) =>
          a.location === g.Agrupacion_ID ||
          a.location?.startsWith(g.Agrupacion_ID + ' /'),
      );
      const groupId =
        a.groupId || movement?.Origen || locationGroup?.Agrupacion_ID || '';
      const projectId =
        a.projectId ||
        state.groups.find((g) => g.Agrupacion_ID === groupId)?.Proyecto_ID ||
        '';
      return {
        ...a,
        id: 'AUDIT-' + index,
        source: 'Verificación registrada',
        groupId,
        projectId,
        element:
          a.element ||
          state.items.find((i) => i.Codigo === a.code)?.Elemento ||
          'Sin ficha vinculada',
        difference: a.found - a.recorded,
      };
    });
    return [...audits, ...seed].sort((a, b) =>
      String(b.date).localeCompare(String(a.date)),
    );
  }
  const api = {
    dateKey,
    period,
    inside,
    report,
    projection,
    validateExpense,
    verificationRecords,
  };
  root.InventoryAnalytics = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
