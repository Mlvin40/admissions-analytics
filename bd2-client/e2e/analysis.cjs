// Verificación de navegador sobre API real; no importa CSV ni ejecuta escrituras
const { chromium } = require(process.env.BD2_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = process.env.BD2_BASE_URL || 'http://127.0.0.1:4200';
const output = path.resolve(__dirname, '../../.local/browser');
fs.mkdirSync(output, { recursive: true });
const report = { mongo: [], neo4j: [], checks: [], errors: [] };
const mongoPaths = [
  'applicants-by-institution-type',
  'approvals-by-subject',
  'approved-applicants-by-career-year',
  'approval-rate-by-subject',
  'mean-age-by-career',
  'career-summary',
  'mean-age-approved-by-career-institution',
  'approved-applicants-by-municipality-career',
  'public-evaluations-by-month-subject',
  'top-careers-age-16-18',
  'applicant-performance',
  'applicants-by-sex-institution',
  'approval-rate-by-age',
  'mean-observed-attempts-by-subject',
  'applicant-history',
  'first-attempt-failures-by-career',
  'top-municipalities',
  'approval-rate-by-institution-type',
  'career-demand-by-department',
  'approval-evolution-by-entry-year',
];
const graphPaths = [
  'applicant-history',
  'approval-by-subject-career',
  'top-careers-by-department',
  'improved-outcomes',
  'municipality-peers',
];
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BD2_CHROME || '/usr/bin/google-chrome',
    headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/api/**', (route) => {
      if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', (e) => report.errors.push(e.message));
    page.on('request', (request) => {
      if (request.url().includes('/api/'))
        assert.equal(request.method(), 'GET', 'La verificación solo admite lecturas');
    });
    async function api(url) {
      const r = await context.request.get(base + url);
      assert.equal(r.status(), 200, url);
      return r.json();
    }
    async function choose(input, id) {
      await page.locator('.p-select-overlay').waitFor({ state: 'hidden' });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('#' + input).click();
      const filter = page.locator('.p-select-filter');
      await filter.waitFor();
      await filter.fill(id);
      await page.waitForFunction(
        (id) =>
          document.querySelectorAll('.p-select-option').length > 0 &&
          Array.from(document.querySelectorAll('.p-select-option')).every((e) =>
            e.textContent.includes(id),
          ),
        id,
      );
      await page.getByRole('option', { name: new RegExp('^' + id + ' ·') }).click();
      await page.waitForFunction(
        ({ input, id }) => document.getElementById(input)?.textContent.includes(id + ' ·'),
        { input, id },
      );
      await page.locator('.p-select-overlay').waitFor({ state: 'hidden' });
    }
    async function lookup(id, query, exact) {
      await page.locator('#' + id).fill(query);
      const option = exact
        ? page.getByRole('option', { name: exact, exact: true })
        : page.getByRole('option').first();
      await option.waitFor();
      await option.click();
    }
    async function execute(path, button) {
      const response = page.waitForResponse(
        (r) => new URL(r.url()).pathname === path && r.request().method() === 'GET',
      );
      await page.getByRole('button', { name: button, exact: true }).click();
      const r = await response;
      assert.equal(r.status(), 200, await r.text());
      const data = await r.json();
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      return data;
    }
    async function screenshot(name) {
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
    }
    async function noOverflow(name) {
      const width = await page.evaluate(() => ({
        document: document.documentElement.scrollWidth,
        viewport: innerWidth,
      }));
      assert.ok(width.document <= width.viewport, name + ': ' + JSON.stringify(width));
    }
    const sample = (await api('/api/search/evaluations?entryYear=2015&limit=1')).items[0];
    assert.ok(sample?.applicant?.key, 'La instancia actual debe exponer el buscador implementado');
    await page.goto(base);
    await page.getByTestId('evaluation-total').waitFor();
    const actualYears = await api('/api/analytics/approval-evolution-by-entry-year?limit=100');
    const expectedTotal = actualYears.items.reduce((sum, r) => sum + r.evaluationCount, 0);
    assert.equal(
      await page.getByTestId('evaluation-total').innerText(),
      expectedTotal.toLocaleString('es-GT'),
    );
    await noOverflow('dashboard desktop');
    await screenshot('dashboard-desktop');
    report.checks.push('Dashboard con totales contrastados contra MongoDB');
    await page.goto(base + '/analytics');
    await page.locator('app-metric-results tbody tr').first().waitFor();
    for (let i = 0; i < 20; i++) {
      const id = 'M' + String(i + 1).padStart(2, '0');
      await choose('analytics-query', id);
      if (i === 10 || i === 14)
        await page.locator('#correlativo').fill(sample.applicant.correlativo_aspirante);
      const data = await execute('/api/analytics/' + mongoPaths[i], 'Ejecutar consulta');
      assert.equal(data.query, id);
      assert.ok(data.items.length > 0, id + ' requiere resultados reales');
      const rows = await page
        .locator(
          (i === 10 || i === 14 ? 'app-history-results' : 'app-metric-results') + ' tbody tr',
        )
        .count();
      assert.equal(rows, data.items.length);
      await noOverflow(id + ' desktop');
      report.mongo.push({ id, rows, total: data.total });
      console.log(id, 'OK', rows, 'filas');
      if (id === 'M06') await screenshot('career-summary-desktop');
      if (id === 'M08') {
        const next = page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname.endsWith('/approved-applicants-by-municipality-career') &&
            new URL(r.url()).searchParams.get('offset') === '25',
        );
        await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
        assert.equal((await next).status(), 200);
        await page.getByRole('button', { name: 'Anterior', exact: true }).click();
      }
    }
    await page.goto(
      base +
        '/analytics?' +
        new URLSearchParams({ query: 'M15', correlativo: sample.applicant.correlativo_aspirante }),
    );
    await page.locator('app-history-results tbody tr').first().waitFor();
    await page.locator('#correlativo').fill(sample.applicant.correlativo_aspirante);
    await execute('/api/analytics/applicant-history', 'Ejecutar consulta');
    await page.getByText('Información completa', { exact: true }).first().click();
    assert.ok(await page.getByText('Nacimiento', { exact: true }).first().isVisible());
    await page.goto(base + '/search');
    await lookup('search-career', 'SISTEMAS', 'INGENIERIA EN CIENCIAS Y SISTEMAS');
    const byCareer = await execute('/api/search/evaluations', 'Buscar evaluaciones');
    assert.ok(byCareer.items.every((r) => r.career.name === 'INGENIERIA EN CIENCIAS Y SISTEMAS'));
    await screenshot('search-desktop');
    await page.goto(base + '/search');
    await page.locator('#search-identity').fill(sample.applicant.correlativo_aspirante);
    const exact = await execute('/api/search/evaluations', 'Buscar evaluaciones');
    assert.ok(exact.items.every((r) => r.applicant.key === sample.applicant.key));
    await page
      .locator('#search-identity')
      .fill(sample.applicant.correlativo_aspirante.slice(0, 10));
    const partial = await execute('/api/search/evaluations', 'Buscar evaluaciones');
    assert.equal(partial.total, 0);
    await page.getByText('No se encontraron evaluaciones con estos criterios.').waitFor();
    await page.locator('#search-identity').fill('');
    await page.locator('#search-year').fill('0');
    await page.getByRole('button', { name: 'Buscar evaluaciones', exact: true }).click();
    await page.getByText('Introduce un ciclo entero', { exact: false }).waitFor();
    report.checks.push('Buscador por carrera, identidad literal, sin coincidencias y validación');
    await page.goto(base + '/graph');
    await page.locator('app-graph-page tbody tr').first().waitFor();
    for (let i = 0; i < 5; i++) {
      const id = 'N0' + (i + 1);
      await choose('graph-query', id);
      await page.locator('#graph-year').fill(String(sample.entryYear));
      if (i === 0 || i === 4) await page.locator('#graph-applicant').fill(sample.applicant.key);
      if (i === 2) await lookup('graph-department', 'GUATEMALA', 'GUATEMALA');
      if (i === 3) await lookup('graph-subject', 'MATEMATICA', 'MATEMATICA');
      const data = await execute('/api/graph/' + graphPaths[i], 'Ejecutar consulta Neo4j');
      assert.equal(data.query, id);
      assert.ok(data.items.length > 0);
      report.neo4j.push({
        id,
        rows: data.items.length,
        nodes: data.graph?.nodes.length,
        edges: data.graph?.edges.length,
      });
      await noOverflow(id + ' desktop');
      console.log(id, 'OK', data.items.length, 'filas');
      if (i === 4) {
        await page.locator('.graph-canvas canvas').first().waitFor();
        assert.ok(data.graph.nodes.length <= 125 && data.graph.edges.length <= 100);
        await screenshot('graph-desktop');
        await page.getByText('Lista accesible de nodos y aristas', { exact: true }).click();
        await page.locator('.node-list button').first().click();
        await page.locator('.graph-inspector .identifier').first().waitFor();
        const canvas = page.locator('.graph-canvas');
        const before = crypto
          .createHash('sha256')
          .update(await canvas.screenshot())
          .digest('hex');
        await page.getByRole('button', { name: 'Acercar', exact: true }).click();
        const after = crypto
          .createHash('sha256')
          .update(await canvas.screenshot())
          .digest('hex');
        assert.notEqual(before, after);
        await canvas.focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('0');
        await page.getByRole('button', { name: 'Ajustar vista', exact: true }).click();
        const municipality = data.graph.nodes.find((n) => n.label === 'Municipality');
        await lookup('graph-municipality', municipality.properties.name);
        const filtered = await execute('/api/graph/municipality-peers', 'Ejecutar consulta Neo4j');
        assert.ok(filtered.items.every((p) => p.municipalityKey === municipality.key));
        await page.locator('#graph-applicant').fill('full32:' + '0'.repeat(32));
        const empty = await execute('/api/graph/municipality-peers', 'Ejecutar consulta Neo4j');
        assert.equal(empty.items.length, 0);
        await page
          .getByText('No se encontraron caminos de procedencia compartida', { exact: false })
          .waitFor();
        await page.locator('#graph-applicant').fill(sample.applicant.key);
        await execute('/api/graph/municipality-peers', 'Ejecutar consulta Neo4j');
      }
    }
    report.checks.push('N05 nodos/aristas, propiedades, zoom, teclado, filtro municipal y vacío');
    // Los fallos se inyectan únicamente en el navegador; las respuestas normales anteriores son reales
    await page.goto(base + '/analytics');
    await page.locator('app-metric-results tbody tr').first().waitFor();
    await page.route('**/api/analytics/approval-rate-by-subject?*', (r) =>
      r.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'private details' }),
      }),
    );
    await page.getByRole('button', { name: 'Ejecutar consulta', exact: true }).click();
    await page.getByText('No se pudo consultar MongoDB.', { exact: false }).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('private details'));
    await page.unroute('**/api/analytics/approval-rate-by-subject?*');
    await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click();
    await page.locator('app-metric-results tbody tr').first().waitFor();
    const slowResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/analytics/approval-rate-by-subject',
    );
    await page.route('**/api/analytics/approval-rate-by-subject?*', async (route) => {
      const response = await route.fetch();
      await new Promise((r) => setTimeout(r, 1000));
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Ejecutar consulta', exact: true }).click();
    await page.getByText('Consultando datos…', { exact: false }).waitFor();
    await (await slowResponse).finished();
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    await page.locator('app-metric-results tbody tr').first().waitFor();
    await page.unroute('**/api/analytics/approval-rate-by-subject?*');
    await page.goto(base + '/graph');
    await page.locator('app-graph-page tbody tr').first().waitFor();
    await page.route('**/api/graph/approval-by-subject-career?*', (route) =>
      route.abort('connectionrefused'),
    );
    await page.getByRole('button', { name: 'Ejecutar consulta Neo4j', exact: true }).click();
    await page.getByText('No se pudo conectar con la API.', { exact: false }).waitFor();
    await page.unroute('**/api/graph/approval-by-subject-career?*');
    await page.getByRole('button', { name: 'Reintentar consulta', exact: true }).click();
    await page.locator('app-graph-page tbody tr').first().waitFor();
    report.checks.push('HTTP 503, red, consulta lenta y recuperación');
    await page.setViewportSize({ width: 375, height: 812 });
    for (const route of ['', '/analytics', '/search', '/graph', '/data-import', '/status']) {
      await page.goto(base + route);
      await page.locator('h1').waitFor();
      await page.waitForTimeout(600);
      await noOverflow(route + ' mobile');
      assert.ok(!/fase\s*[0-6]/i.test(await page.locator('body').innerText()));
      await page.getByRole('button', { name: 'Abrir navegación', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Consultas MongoDB' }).waitFor();
      await page.keyboard.press('Escape');
      await screenshot((route || 'dashboard').replace('/', '') + '-mobile');
    }
    await page.goto(
      base +
        '/graph?' +
        new URLSearchParams({
          query: 'N05',
          applicantKey: sample.applicant.key,
          entryYear: String(sample.entryYear),
        }),
    );
    await page.locator('.graph-canvas canvas').first().waitFor();
    await noOverflow('graph canvas mobile');
    await screenshot('graph-canvas-mobile');
    await page.getByText('Lista accesible de nodos y aristas', { exact: true }).click();
    await page.locator('.node-list button').first().click();
    await page.locator('.graph-inspector .identifier').first().waitFor();
    report.checks.push('Navegación móvil, todas las rutas sin desbordamiento y grafo móvil');
    await require('./interaction.cjs')({ page, context, base, report, output });
    assert.equal(report.errors.length, 0, report.errors.join('\n'));
    fs.rmSync(path.join(output, 'failure.json'), { force: true });
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  fs.writeFileSync(
    path.join(output, 'failure.json'),
    JSON.stringify({ ...report, failure: e.message }, null, 2),
  );
  process.exit(1);
});
