/*
Creación de colección auxiliar resumen_carrera
Generar una colección que almacene información resumida por carrera utilizando los datos procesados.
*/

// El bloque permite cargar este archivo varias veces sin redeclarar constantes
(() => {
  if (db.getName() !== "bd2_final") throw new Error("Selecciona la base bd2_final");
  // Paginación de la API: offset 0 a 1000000; limit 1 a 100
  const page = { offset: 0, limit: 25, sort: null, direction: null };
  if (!Number.isInteger(page.offset) || page.offset < 0 || page.offset > 1000000 ||
      !Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100)
    throw new Error("Paginación fuera de rango");
  // M06 es global: no admite ciclo, materia, sexo, edades ni fechas
  const careerKey = null;
  if (page.sort !== null && !["key", "count", "rate", "age"].includes(page.sort)) throw new Error("Orden no disponible");
  const metadata = db.analytics_metadata.findOne({ _id: "career-summary" });
  if (metadata === null) {
    print(EJSON.stringify({ query: "M06", unit: "CAREER_SUMMARY", offset: page.offset,
      limit: page.limit, total: 0, excludedEvaluations: 0, nextCursor: null, items: [],
      summary: { generatedAt: null, sourceSnapshot: null, sourceEvaluationCount: 0, refreshRequired: true }
    }, null, 2, { relaxed: true }));
    return;
  }
  // Detecta una publicación incompleta igual que AnalyticsService.summary
  if (db.resumen_carrera.countDocuments({ sourceSnapshot: { $ne: metadata.sourceSnapshot } }) !== 0)
    throw new Error("Publicación del resumen incompleta; la API devolvería 503");
  const crypto = require("crypto"); // Módulo incluido en mongosh, sin instalación
  const count = db.evaluations.countDocuments({});
  const hashes = db.evaluations.distinct("sources.fileSha256").sort();
  const snapshot = crypto.createHash("sha256").update(String(count) + "\n" + hashes.join("\n"), "utf8").digest("hex");
  const summaryMatch = careerKey === null ? {} : { _id: careerKey };
  const sortField = page.sort ?? "count";
  const direction = page.direction === null ? (sortField === "key" ? 1 : -1) : (page.direction === "asc" ? 1 : -1);
  const actualField = { key: "_tie", count: "_count", rate: "approvalRate", age: "meanAge" }[sortField];
  const ordering = actualField === "_tie" ? { _tie: direction } : { [actualField]: direction, _tie: 1 };
  const result = db.resumen_carrera.aggregate([
    { $match: summaryMatch },
    // Adapta nombres persistidos a las métricas que consume Angular
    { $set: { _g: { career: "$career" }, _tie: "$_id", _count: "$uniqueApplicantCount",
      applicantCount: "$uniqueApplicantCount", approvedCount: "$approvedEvaluationCount",
      failedCount: "$failedEvaluationCount", knownOutcomeCount: { $add: ["$approvedEvaluationCount", "$failedEvaluationCount"] },
      meanAge: "$meanApplicantAge" } },
    { $facet: {
      items: [ { $sort: ordering }, { $skip: page.offset }, { $limit: page.limit },
        { $project: {"_id": 0, "group": "$_g", "applicantCount": 1, "evaluationCount": 1, "approvedCount": 1, "failedCount": 1, "unknownOutcomeCount": 1, "knownOutcomeCount": 1, "approvalRate": 1, "failureRate": 1, "meanAge": 1, "ageSampleCount": 1, "excludedAgeApplicantCount": 1, "meanAttempts": 1, "applicantCycleCount": 1, "excludedAttemptGroups": 1, "rank": 1, "applicantsWithApproval": 1} } ],
      total: [ { $count: "count" } ]
    } }
  ], { allowDiskUse: true, maxTimeMS: 20000 }).toArray()[0];
  print(EJSON.stringify({ query: "M06", unit: "CAREER_SUMMARY", offset: page.offset,
    limit: page.limit, total: result.total[0]?.count ?? 0, excludedEvaluations: 0,
    nextCursor: null, items: result.items, summary: { generatedAt: metadata.generatedAt,
      sourceSnapshot: metadata.sourceSnapshot, sourceEvaluationCount: metadata.sourceEvaluationCount,
      refreshRequired: metadata.sourceSnapshot !== snapshot }
  }, null, 2, { relaxed: true }));
})();

/* =========================================================
   M06 - GENERACIÓN PERSISTIDA MANUAL DESACTIVADA
   Copia únicamente el código desde (() => { hasta })(); a mongosh
   si decides realizar una generación persistida fuera de las pruebas de lectura
   NO ejecutar durante una verificación de lectura
   Equivale a refresh, no a GET career-summary
   =========================================================
(() => {
  if (db.getName() !== "bd2_final") throw new Error("Selecciona bd2_final");
  const crypto = require("crypto");
  const fingerprint = () => {
    const count = db.evaluations.countDocuments({});
    const hashes = db.evaluations.distinct("sources.fileSha256").sort();
    return { count, hash: crypto.createHash("sha256")
      .update(String(count) + "\n" + hashes.join("\n"), "utf8").digest("hex") };
  };
  const before = fingerprint();
  const generatedAt = new Date();
  const staging = "resumen_carrera_build_" + crypto.randomUUID().replaceAll("-", "");
  try {
    // BEGIN GENERATION PIPELINE
    const generationPipeline = [
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
    // Ordena con los mismos desempates que la aplicación
    {
      "$sort": {
        "entryYear": -1,
        "assignmentDate": -1,
        "opportunity": -1,
        "_id": -1
      }
    },
    // Agrupa por claves reales y calcula las métricas indicadas
    {
      "$group": {
        "_id": {
          "career": "$career.key",
          "applicant": "$applicant.key"
        },
        "career": {
          "$first": "$career"
        },
        "age": {
          "$first": "$_age"
        },
        "evaluationCount": {
          "$sum": 1
        },
        "approved": {
          "$sum": {
            "$cond": [
              {
                "$eq": [
                  "$passed",
                  true
                ]
              },
              1,
              0
            ]
          }
        },
        "failed": {
          "$sum": {
            "$cond": [
              {
                "$eq": [
                  "$passed",
                  false
                ]
              },
              1,
              0
            ]
          }
        },
        "known": {
          "$sum": {
            "$cond": [
              {
                "$in": [
                  {
                    "$ifNull": [
                      "$passed",
                      null
                    ]
                  },
                  [
                    true,
                    false
                  ]
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    // Agrupa por claves reales y calcula las métricas indicadas
    {
      "$group": {
        "_id": "$_id.career",
        "career": {
          "$first": "$career"
        },
        "evaluationCount": {
          "$sum": "$evaluationCount"
        },
        "uniqueApplicantCount": {
          "$sum": 1
        },
        "approvedEvaluationCount": {
          "$sum": "$approved"
        },
        "failedEvaluationCount": {
          "$sum": "$failed"
        },
        "known": {
          "$sum": "$known"
        },
        "applicantsWithApproval": {
          "$sum": {
            "$cond": [
              {
                "$gt": [
                  "$approved",
                  0
                ]
              },
              1,
              0
            ]
          }
        },
        "meanApplicantAge": {
          "$avg": "$age"
        },
        "ageSampleCount": {
          "$sum": {
            "$cond": [
              {
                "$isNumber": "$age"
              },
              1,
              0
            ]
          }
        },
        "excludedAgeApplicantCount": {
          "$sum": {
            "$cond": [
              {
                "$eq": [
                  "$age",
                  null
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    // Calcula valores derivados sin modificar documentos almacenados
    {
      "$set": {
        "unknownOutcomeCount": {
          "$subtract": [
            "$evaluationCount",
            "$known"
          ]
        },
        "approvalRate": {
          "$cond": [
            {
              "$gt": [
                "$known",
                0
              ]
            },
            {
              "$divide": [
                {
                  "$multiply": [
                    100.0,
                    "$approvedEvaluationCount"
                  ]
                },
                "$known"
              ]
            },
            null
          ]
        },
        "generatedAt": generatedAt,
        "sourceSnapshot": before.hash,
        "sourceEvaluationCount": NumberLong(String(before.count))
      }
    },
    // Retira un campo de cálculo del resultado
    {
      "$unset": "known"
    },
    // Escritura solo en el bloque manual desactivado
    {
      "$out": staging
    }
    ];
    // END GENERATION PIPELINE
    db.evaluations.aggregate(generationPipeline, { allowDiskUse: true, maxTimeMS: 30000 }).toArray();
    const after = fingerprint();
    if (before.count !== after.count || before.hash !== after.hash)
      throw new Error("Los datos cambiaron; conservar resumen anterior y reintentar sin cargas activas");
    // Publica el conjunto completo y guarda el metadato como hace el repositorio
    db.getCollection(staging).renameCollection("resumen_carrera", true);
    db.analytics_metadata.replaceOne({ _id: "career-summary" }, { _id: "career-summary",
      generatedAt, sourceSnapshot: before.hash, sourceEvaluationCount: NumberLong(String(before.count))
    }, { upsert: true });
    print("Resumen generado; vuelve a cargar M06.js para leerlo");
  } finally {
    // Elimina exclusivamente el staging propio, nunca evaluations ni el resumen publicado
    if (db.getCollectionNames().includes(staging)) db.getCollection(staging).drop();
  }
})();
*/
