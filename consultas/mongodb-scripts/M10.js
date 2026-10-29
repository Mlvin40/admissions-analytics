/*
Top 5 de carreras más demandadas por aspirantes entre 16 y 18 años
Determinar las cinco carreras objetivo con mayor cantidad de aspirantes dentro de ese rango de edad.
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
  const allowedSorts = ["key", "count"];
  if (page.sort !== null && !allowedSorts.includes(page.sort)) throw new Error("Orden no disponible");
  if (page.direction !== null && !["asc", "desc"].includes(page.direction)) throw new Error("Dirección inválida");
  const sortField = page.sort ?? "count";
  const direction = page.direction === null ? (sortField === "key" ? 1 : -1) : (page.direction === "asc" ? 1 : -1);
  const actualField = { key: "_tie", count: "_count", rate: "approvalRate", age: "meanAge", attempts: "meanAttempts" }[sortField];
  const ordering = actualField === "_tie" ? { _tie: direction } : { [actualField]: direction, _tie: 1 };
  const result = db.evaluations.aggregate([
    { $match: match },
    // Selecciona los campos del resultado o excluye datos pesados
    {
      "$project": {
        "sources": 0,
        "qualityIssues": 0,
        "graphSyncState": 0
      }
    },
    // Calcula valores derivados sin modificar documentos almacenados
    {
      "$set": {
        "_age": {
          "$cond": [
            {
              "$and": [
                {
                  "$isNumber": "$entryAge"
                },
                {
                  "$gte": [
                    "$entryAge",
                    0
                  ]
                },
                {
                  "$lte": [
                    "$entryAge",
                    100
                  ]
                }
              ]
            },
            "$entryAge",
            null
          ]
        }
      }
    },
    // Filtra registros antes de agrupar sin expandir sources
    {
      "$match": {
        "career.known": true,
        "_age": {
          "$gte": 16,
          "$lte": 18
        }
      }
    },
    // Deduplica por identidad completa dentro de cada combinación de dimensiones
    {
      "$group": {
        "_id": {
          "career": "$career.key",
          "applicant": "$applicant.key"
        },
        "_g": {
          "$first": {
            "career": "$career"
          }
        }
      }
    },
    // Cuenta las identidades deduplicadas y conserva la etiqueta del grupo
    {
      "$group": {
        "_id": {
          "career": "$_id.career"
        },
        "_g": {
          "$first": "$_g"
        },
        "applicantCount": {
          "$sum": 1
        }
      }
    },
    // Calcula valores derivados sin modificar documentos almacenados
    {
      "$set": {
        "_tie": "$_id",
        "_count": "$applicantCount"
      }
    },
    // Ordena con los mismos desempates que la aplicación
    {
      "$sort": {
        "applicantCount": -1,
        "_tie": 1
      }
    },
    // Limita el resultado antes de la paginación cuando corresponde
    {
      "$limit": 5
    },
    // $facet calcula página y total sobre el mismo conjunto de grupos
    { $facet: {
      items: [ { $sort: ordering }, { $skip: page.offset }, { $limit: page.limit },
        { $project: {"_id": 0, "group": "$_g", "applicantCount": 1, "evaluationCount": 1, "approvedCount": 1, "failedCount": 1, "unknownOutcomeCount": 1, "knownOutcomeCount": 1, "approvalRate": 1, "failureRate": 1, "meanAge": 1, "ageSampleCount": 1, "excludedAgeApplicantCount": 1, "meanAttempts": 1, "applicantCycleCount": 1, "excludedAttemptGroups": 1, "rank": 1, "applicantsWithApproval": 1} } ],
      total: [ { $count: "count" } ]
    } }
  ], { allowDiskUse: true, maxTimeMS: 20000 }).toArray()[0];
  // Cuenta exclusiones por calidad dentro del filtro, no filas ajenas al top
  const excluded = db.evaluations.aggregate([
    { $match: match },
    // Filtra registros antes de agrupar sin expandir sources
    {
      "$match": {
        "$expr": {
          "$or": [
            {
              "$not": [
                {
                  "$and": [
                    {
                      "$isNumber": "$entryAge"
                    },
                    {
                      "$gte": [
                        "$entryAge",
                        0
                      ]
                    },
                    {
                      "$lte": [
                        "$entryAge",
                        100
                      ]
                    }
                  ]
                }
              ]
            },
            {
              "$and": [
                {
                  "$gte": [
                    "$entryAge",
                    16
                  ]
                },
                {
                  "$lte": [
                    "$entryAge",
                    18
                  ]
                },
                {
                  "$ne": [
                    "$career.known",
                    true
                  ]
                }
              ]
            }
          ]
        }
      }
    },
    { $count: "count" }
  ], { allowDiskUse: true, maxTimeMS: 20000 }).toArray();
  const excludedEvaluations = excluded.length ? excluded[0].count : 0;
  print(EJSON.stringify({ query: "M10", unit: "APPLICANTS", offset: page.offset, limit: page.limit,
    total: result.total[0]?.count ?? 0, excludedEvaluations, nextCursor: null,
    items: result.items, summary: null }, null, 2, { relaxed: true }));
})();
