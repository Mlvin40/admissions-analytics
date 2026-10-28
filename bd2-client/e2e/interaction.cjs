// Casos adicionales de filtros, procedencia, cursores y conservación del módulo CSV
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function ({ page, context, base, report, output }) {
  async function api(url) {
    const r = await context.request.get(base + url);
    assert.equal(r.status(), 200, url);
    return r.json();
  }
  async function ready() {
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  }
  async function select(id, label) {
    await page.locator('.p-select-overlay').waitFor({ state: 'hidden' });
    await page.locator('#' + id).click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await page.locator('.p-select-overlay').waitFor({ state: 'hidden' });
  }
  async function run(url, label) {
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === url);
    await page.getByRole('button', { name: label, exact: true }).click();
    const r = await response;
    assert.equal(r.status(), 200);
    const data = await r.json();
    await ready();
    return data;
  }
  async function lookup(id, option, dimension) {
    const real = (
      await api('/api/search/options?' + new URLSearchParams({ dimension, key: option.key }))
    ).items[0];
    assert.ok(real);
    const label =
      (real.contextName ? real.contextName + ' · ' : '') +
      real.name +
      (real.sourceValue && real.sourceValue !== real.sourceValue.trim()
        ? ' · espacio en origen'
        : '');
    await page.locator('#' + id).fill(real.name);
    await page.getByRole('option', { name: label, exact: true }).click();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const candidates = (await api('/api/search/evaluations?entryYear=2015&limit=100')).items;
  const sample = candidates.find((e) => e.origin.municipality.known && e.origin.department.known);
  assert.ok(sample);
  const criteria = [
    ['subject', sample.subject, (r) => r.subject.key],
    ['department', sample.origin.department, (r) => r.origin.department.key],
    ['municipality', sample.origin.municipality, (r) => r.origin.municipality.key],
    ['institution', sample.origin.institutionType, (r) => r.origin.institutionType.key],
  ];
  report.search = [];
  for (const [name, option, getKey] of criteria) {
    await page.goto(base + '/search');
    await lookup('search-' + name, option, name === 'institution' ? 'institutionType' : name);
    const data = await run('/api/search/evaluations', 'Buscar evaluaciones');
    assert.ok(data.total > 0);
    assert.ok(data.items.every((r) => getKey(r) === option.key));
    report.search.push({ criterion: name, total: data.total });
  }
  let longHistory = null;
  const visited = new Set();
  for (const record of candidates) {
    const id = record.applicant.correlativo_aspirante;
    if (visited.has(id)) continue;
    visited.add(id);
    const h = await api(
      '/api/analytics/applicant-performance?' + new URLSearchParams({ correlativo: id, limit: 1 }),
    );
    if (h.total > 10) {
      longHistory = { record, total: h.total };
      break;
    }
  }
  assert.ok(longHistory, 'Debe encontrarse un historial real con varias páginas');
  const id = longHistory.record.applicant.correlativo_aspirante;
  await page.goto(base + '/analytics?' + new URLSearchParams({ query: 'M11', correlativo: id }));
  await page.locator('app-history-results tbody tr').first().waitFor();
  await select('page-limit', '10');
  const first = await run('/api/analytics/applicant-performance', 'Ejecutar consulta');
  assert.ok(first.nextCursor);
  const nextResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/analytics/applicant-performance' &&
      new URL(r.url()).searchParams.has('cursor'),
  );
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  const response = await nextResponse;
  assert.equal(response.status(), 200);
  assert.ok(!new URL(response.url()).searchParams.has('offset'));
  const next = await response.json();
  await ready();
  assert.ok(!next.items.some((a) => first.items.some((b) => a.evaluationId === b.evaluationId)));
  report.checks.push('Historial real paginado mediante cursor, sin solapamiento ni offset');
  await page.goto(base + '/analytics?' + new URLSearchParams({ query: 'M15', correlativo: id }));
  await page.locator('app-history-results tbody tr').first().waitFor();
  await page.getByText('Información completa', { exact: true }).first().click();
  await page.locator('app-history-results details details summary').first().click();
  await page.getByText('SHA-256 del archivo', { exact: true }).first().waitFor();
  assert.ok(
    (await page.locator('app-history-results pre').first().innerText()).includes(
      'fecha_asignacion',
    ),
  );
  await page.goto(base + '/analytics');
  await page.locator('app-metric-results tbody tr').first().waitFor();
  await select('sort-filter', 'Aprobación');
  await select('direction-filter', 'Ascendente');
  const ordered = await run('/api/analytics/approval-rate-by-subject', 'Ejecutar consulta');
  const rates = ordered.items.map((r) => r.approvalRate);
  assert.deepEqual(
    rates,
    [...rates].sort((a, b) => a - b),
  );
  await page.locator('#entry-year').fill('2024');
  const subject = (await api('/api/search/options?dimension=subject&q=MATEMATICA')).items.find(
    (o) => o.name === 'MATEMATICA',
  );
  await lookup('subject-filter', subject, 'subject');
  const filtered = await run('/api/analytics/approval-rate-by-subject', 'Ejecutar consulta');
  const known = (
    await api(
      '/api/search/evaluations?' +
        new URLSearchParams({ entryYear: 2024, subjectKey: subject.key, limit: 1 }),
    )
  ).total;
  assert.equal(filtered.items[0].evaluationCount, known);
  await page.locator('details.advanced > summary').click();
  await page.locator('#min-age').fill('20');
  await page.locator('#max-age').fill('16');
  await page.getByRole('button', { name: 'Ejecutar consulta', exact: true }).click();
  await page
    .getByText('Revisa el identificador completo, el ciclo y los rangos', { exact: false })
    .waitFor();
  await page.goto(
    base +
      '/graph?' +
      new URLSearchParams({
        query: 'N05',
        applicantKey: sample.applicant.key,
        entryYear: sample.entryYear,
      }),
  );
  await page.locator('.graph-canvas canvas').first().waitFor();
  await page.getByText('Lista accesible de nodos y aristas', { exact: true }).click();
  await page.locator('.node-list').nth(1).locator('button').first().click();
  await page.locator('.graph-inspector').getByText('Relación', { exact: true }).waitFor();
  await page.locator('#graph-year').fill('9999');
  const empty = await run('/api/graph/municipality-peers', 'Ejecutar consulta Neo4j');
  assert.equal(empty.items.length, 0);
  await page.locator('#graph-year').fill(String(sample.entryYear));
  await run('/api/graph/municipality-peers', 'Ejecutar consulta Neo4j');
  await page.locator('.graph-canvas canvas').first().waitFor();
  const own = (
    await api(
      '/api/search/evaluations?' +
        new URLSearchParams({
          correlativo: sample.applicant.correlativo_aspirante,
          entryYear: sample.entryYear,
          limit: 100,
        }),
    )
  ).items;
  const keys = new Set(own.map((r) => r.origin.municipality.key));
  const alternative = (
    await api('/api/search/options?dimension=municipality&limit=100')
  ).items.find((o) => o.known && !keys.has(o.key));
  assert.ok(alternative);
  await lookup('graph-municipality', alternative, 'municipality');
  const excluded = await run('/api/graph/municipality-peers', 'Ejecutar consulta Neo4j');
  assert.equal(excluded.items.length, 0);
  report.checks.push(
    'Ordenamiento ascendente, filtros MongoDB contrastados, fuentes completas y filtro municipal que cambia el grafo',
  );
  await page.goto(base + '/graph');
  await page.locator('app-graph-page tbody tr').first().waitFor();
  await page.route('**/api/graph/approval-by-subject-career?*', (r) =>
    r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  );
  await page.getByRole('button', { name: 'Ejecutar consulta Neo4j', exact: true }).click();
  await page.getByText('No se pudo consultar Neo4j.', { exact: false }).waitFor();
  await page.unroute('**/api/graph/approval-by-subject-career?*');
  await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click();
  await page.locator('app-graph-page tbody tr').first().waitFor();
  await page.goto(base + '/data-import');
  await page.locator('app-data-import-page tbody tr').first().waitFor();
  const uploader = page.locator('p-fileupload');
  assert.ok((await uploader.locator('input[type=file]').first().getAttribute('multiple')) !== null);
  const originals = [2015, 2016].map((year) =>
    path.resolve(__dirname, '../../datas/ArchivosCSV/pruebas_especificas_' + year + '.csv'),
  );
  await uploader.locator('input[type=file]').first().setInputFiles(originals);
  for (const filename of originals.map((p) => path.basename(p)))
    assert.ok((await uploader.innerText()).includes(filename));
  await page.getByRole('button', { name: 'Limpiar selección', exact: true }).click();
  const reject = page.getByRole('button', { name: /Ver rechazos/ }).first();
  const rejected = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/rejections'));
  await reject.click();
  const rejectedPage = await (await rejected).json();
  await page.getByRole('heading', { name: /Rechazos de/ }).waitFor();
  assert.ok(
    (await page.locator('section[aria-labelledby="rejections-title"]').innerText()).includes(
      rejectedPage.items[0].reason,
    ),
  );
  report.checks.push(
    'Carga CSV preservada: selección múltiple sin enviar, historial real y motivos de rechazo',
  );
  const foreign = await context
    .browser()
    .newContext({ viewport: { width: 1200, height: 900 }, timezoneId: 'Asia/Tokyo' });
  try {
    const tab = await foreign.newPage();
    const h = await api(
      '/api/graph/applicant-history?' +
        new URLSearchParams({
          applicantKey: sample.applicant.key,
          entryYear: sample.entryYear,
          limit: 1,
        }),
    );
    await tab.goto(
      base +
        '/graph?' +
        new URLSearchParams({
          query: 'N01',
          applicantKey: sample.applicant.key,
          entryYear: sample.entryYear,
        }),
    );
    await tab.locator('app-history-results tbody tr').first().waitFor();
    const date = h.items[0].evaluation.assignmentDate;
    const expected = date.split('-').reverse().join('/');
    assert.ok(
      (await tab.locator('app-history-results tbody tr').first().innerText()).includes(expected),
    );
  } finally {
    await foreign.close();
  }
  report.checks.push('Fechas Neo4j conservan el día de asignación incluso desde otro huso horario');
  await page.screenshot({ path: path.join(output, 'csv-preserved.png'), fullPage: true });
};
