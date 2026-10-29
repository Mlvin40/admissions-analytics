/*
Historial completo de un aspirante
Mostrar toda la información disponible de un aspirante identificado mediante su correlativo_aspirante.
*/

// El bloque permite cargar este archivo varias veces sin redeclarar constantes
(() => {
  if (db.getName() !== "bd2_final") throw new Error("Selecciona la base bd2_final");
  // Modifica valores aquí; null omite el filtro, false sí filtra reprobadas
  const filters = {
    entryYear: null, careerKey: null, subjectKey: null,
    institutionTypeKey: null, departmentKey: null, municipalityKey: null,
    sex: null, passed: null, minAge: null, maxAge: null,
    assignmentFrom: null, assignmentTo: null
  };
  // Fechas YYYY-MM-DD inclusivas en UTC; claves copiadas del resultado o de Angular
  const match = {};
  if (filters.entryYear !== null) match.entryYear = filters.entryYear;
  for (const [parameter, field] of Object.entries({
    careerKey: "career.key", subjectKey: "subject.key",
    institutionTypeKey: "origin.institutionType.key",
    departmentKey: "origin.department.key", municipalityKey: "origin.municipality.key"
  })) if (filters[parameter] !== null) match[field] = filters[parameter];
  if (filters.sex !== null)
    match.sex = filters.sex.toUpperCase() === "SIN REGISTRO" ? null : filters.sex.trim().toUpperCase();
  if (filters.passed !== null) match.passed = filters.passed;
  if (filters.minAge !== null || filters.maxAge !== null) {
    match.entryAge = { $type: "number", $gte: filters.minAge ?? 0, $lte: filters.maxAge ?? 100 };
  }
  if (filters.assignmentFrom !== null || filters.assignmentTo !== null) {
    match.assignmentDate = {};
    if (filters.assignmentFrom !== null)
      match.assignmentDate.$gte = new Date(filters.assignmentFrom + "T00:00:00.000Z");
    if (filters.assignmentTo !== null) {
      const until = new Date(filters.assignmentTo + "T00:00:00.000Z");
      until.setUTCDate(until.getUTCDate() + 1);
      match.assignmentDate.$lt = until;
    }
  }
  if (filters.minAge !== null && filters.maxAge !== null && filters.minAge > filters.maxAge)
    throw new Error("Rango de edades invertido");
  if (filters.assignmentFrom !== null && filters.assignmentTo !== null && filters.assignmentFrom > filters.assignmentTo)
    throw new Error("Rango de fechas invertido");
  // Paginación de la API: offset 0 a 1000000; limit 1 a 100
  const page = { offset: 0, limit: 25, sort: null, direction: null };
  if (!Number.isInteger(page.offset) || page.offset < 0 || page.offset > 1000000 ||
      !Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100)
    throw new Error("Paginación fuera de rango");
  // Ejemplo real anónimo de esta base; sustituye por el correlativo COMPLETO
  const correlativo = "8b3a7afeed814ad9bef0712a382355cc";
  // null detecta full32, short u other; nunca une identidades por prefijos
  const identityScheme = null;
  // Pega nextCursor de la API o de este archivo; conserva los filtros y offset 0
  const cursor = null;
  if (page.sort !== null || page.direction !== null) throw new Error("Historial con orden fijo");
  if (cursor !== null && page.offset !== 0) throw new Error("No combinar cursor y offset");
  const id = correlativo.trim().normalize("NFC");
  if (!id) throw new Error("Correlativo completo obligatorio");
  const scheme = identityScheme ?? (/^[0-9a-f]{32}$/.test(id) ? "full32" : /^[0-9a-f]{20,23}$/.test(id) ? "short" : "other");
  const applicantKey = scheme + ":" + id;
  // El cursor usa Extended JSON BSON y Base64 URL, como AnalyticsService
  // relaxed false conserva Long.MAX_VALUE sin perder precisión si falta el ciclo
  const after = cursor === null ? null : EJSON.parse(Buffer.from(cursor, "base64url").toString("utf8"), { relaxed: false });
  const cursorStages = after === null ? [] : [ { $match: { $or: [
    { _sortYear: { $gt: after.year } },
    { _sortYear: after.year, _sortDate: { $gt: after.date } },
    { _sortYear: after.year, _sortDate: after.date, _id: { $gt: after.id } }
  ] } } ];
  const result = db.evaluations.aggregate([
    { $match: match },
    { $match: { "applicant.key": applicantKey } },
    // Los valores ausentes se ordenan al final con los mismos centinelas Java
    { $set: { _sortYear: { $ifNull: ["$entryYear", NumberLong("9223372036854775807")] },
              _sortDate: { $ifNull: ["$assignmentDate", new Date(253402214400000)] } } },
    { $facet: {
      items: [
        ...cursorStages,
        { $sort: { _sortYear: 1, _sortDate: 1, _id: 1 } },
        { $skip: page.offset },
        // Una fila adicional permite saber si hay otra página
        { $limit: page.limit + 1 },
        { $project: {"_id": 0, "evaluationId": "$_id", "_sortYear": 1, "_sortDate": 1, "subject": 1, "career": 1, "entryYear": 1, "opportunity": 1, "passed": 1, "assignmentDate": 1, "applicant": 1, "birthYear": 1, "sex": 1, "entryAge": 1, "origin": 1, "qualityIssues": 1, "sources": 1} }
      ],
      // El total es del historial filtrado completo, también al usar cursor
      total: [ { $count: "count" } ]
    } }
  ], { allowDiskUse: true, maxTimeMS: 20000 }).toArray()[0];
  const more = result.items.length > page.limit;
  const rows = result.items.slice(0, page.limit);
  const last = rows[rows.length - 1];
  const nextCursor = more && last ? Buffer.from(EJSON.stringify({
    year: last._sortYear, date: last._sortDate, id: last.evaluationId
  }, { relaxed: false }), "utf8").toString("base64url") : null;
  // Los centinelas son internos; el DTO de la aplicación tampoco los expone
  rows.forEach(row => { delete row._sortYear; delete row._sortDate; });
  print(EJSON.stringify({ query: "M15", unit: "EVALUATIONS", offset: page.offset, limit: page.limit,
    total: result.total[0]?.count ?? 0, excludedEvaluations: 0, nextCursor, items: rows, summary: null
  }, null, 2, { relaxed: true }));
})();
