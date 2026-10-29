// Intercepta todas las cargas y reintentos; ninguna escritura llega al backend
const { chromium } = require(process.env.BD2_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.BD2_BASE_URL || 'http://127.0.0.1:4200';
const output = path.resolve(__dirname, '../../.local/browser-batch');
fs.mkdirSync(output, { recursive: true });
const file = (id, changes = {}) => ({
  id,
  fileName: `${id}.csv`,
  status: 'QUEUED',
  totalRead: 0,
  valid: 0,
  processed: 0,
  rejected: 0,
  pending: 0,
  mongoStored: 0,
  newEvaluations: 0,
  alreadyExisting: 0,
  duplicates: 0,
  elapsedMs: 0,
  attempt: 1,
  message: '',
  ...changes,
});
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BD2_CHROME || '/usr/bin/google-chrome',
    headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [],
      unexpected = [],
      operations = new Map();
    let batches = 0,
      historyPolls = 0,
      statusReads = 0,
      retryRequests = 0,
      offline = false;
    const history = Array.from({ length: 55 }, (_, i) =>
      file(`historic-${i}`, {
        fileName: i === 0 ? 'synthetic-2015.csv' : `historic-${i}.csv`,
        status: 'COMPLETED_WITH_REJECTIONS',
        totalRead: 100002,
        processed: 100000,
        rejected: 2,
      }),
    );
    await context.route('**/api/**', async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const send = (json, status = 200) => route.fulfill({ status, json });
      if (url.pathname === '/api/imports' && request.method() === 'POST') {
        batches++;
        const files = Array.from({ length: batches === 1 ? 10 : 1 }, (_, i) =>
          file(`batch-${batches}-${i}`, { fileName: `synthetic-${2015 + i}.csv` }),
        );
        files.forEach((f) => operations.set(f.id, f));
        return send(files, 202);
      }
      if (url.pathname === '/api/imports' && request.method() === 'GET') {
        historyPolls++;
        if (offline) return send({}, 503);
        const offset = Number(url.searchParams.get('offset'));
        return send([...operations.values(), ...history].slice(offset, offset + 50));
      }
      if (request.method() === 'GET' && url.pathname.endsWith('/rejections'))
        return send({
          total: 2,
          offset: 0,
          limit: 25,
          items: [
            {
              recordNumber: 2,
              reason: 'Columnas incorrectas',
              values: ['wrong', '<script>unsafe</script>'],
            },
            { recordNumber: 4, reason: 'Identificador vacío', values: [''] },
          ],
        });
      if (request.method() === 'POST' && url.pathname.endsWith('/retry')) {
        retryRequests++;
        const previous = operations.get(url.pathname.split('/')[3]);
        const next = {
          ...previous,
          status: 'QUEUED',
          attempt: previous.attempt + 1,
          processed: 0,
          pending: 0,
        };
        operations.set(next.id, next);
        return send(next, 202);
      }
      if (request.method() === 'GET' && url.pathname.startsWith('/api/imports/')) {
        statusReads++;
        return offline ? send({}, 503) : send(operations.get(url.pathname.split('/')[3]));
      }
      if (request.method() !== 'GET') unexpected.push(request.method() + ' ' + url.pathname);
      return route.abort();
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/data-import');
    await page.locator('tbody tr').first().waitFor();
    const first = page
      .locator('tbody tr')
      .filter({ hasText: 'synthetic-2015.csv' })
      .filter({ hasText: '100000' })
      .first();
    const second = page.locator('tbody tr').filter({ hasText: 'historic-1.csv' });
    await first.locator('summary').click();
    await second.locator('summary').click();
    const detail = await first.locator('details').elementHandle(),
      other = await second.locator('details').elementHandle();
    await first
      .getByRole('button', { name: 'Ver rechazos de synthetic-2015.csv', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('article').nth(1).waitFor();
    const before = historyPolls;
    await page.waitForTimeout(11000);
    assert.ok(historyPolls - before >= 6);
    assert.ok(await detail.evaluate((e) => e.open && e.isConnected));
    assert.ok(await other.evaluate((e) => e.open && e.isConnected));
    assert.ok(await dialog.isVisible());
    await dialog.getByRole('button', { name: 'Cerrar rechazos', exact: true }).click();
    async function upload(size) {
      await page
        .locator('input[type=file]')
        .first()
        .setInputFiles(
          Array.from({ length: size }, (_, i) => ({
            name: `synthetic-${2015 + i}.csv`,
            mimeType: 'text/csv',
            buffer: Buffer.from('synthetic,in-memory\n'),
          })),
        );
      await page.getByRole('button', { name: 'Importar archivos', exact: true }).click();
    }
    const panel = (id) =>
      page.getByRole('region', { name: `Progreso del envío ${id}`, exact: true });
    async function percent(id, value) {
      await page.waitForFunction(
        ({ id, value }) =>
          document
            .querySelector(`[aria-labelledby="batch-title-${id}"] [role="progressbar"]`)
            ?.getAttribute('aria-valuenow') === String(value),
        { id, value },
      );
    }
    await upload(10);
    await panel(1).waitFor();
    await percent(1, 0);
    assert.ok((await panel(1).innerText()).includes('10 en cola'));
    assert.ok((await panel(1).innerText()).includes('0 de 10 archivos finalizados'));
    operations.set('batch-1-0', {
      ...operations.get('batch-1-0'),
      status: 'RUNNING',
      totalRead: 7,
      processed: 5,
      pending: 2,
    });
    await page.waitForFunction(() =>
      document.querySelector('.current')?.textContent.includes('synthetic-2015.csv'),
    );
    assert.ok(!(await panel(1).innerText()).includes('100000'));
    await panel(1).screenshot({ path: path.join(output, 'desktop-running.png') });
    await page.getByRole('button', { name: 'Siguientes', exact: true }).click();
    for (let i = 0; i < 10; i++) {
      const current = operations.get(`batch-1-${i}`);
      operations.set(current.id, {
        ...current,
        status: 'COMPLETED',
        totalRead: 10,
        processed: 10,
        pending: 0,
      });
      if (i < 9) {
        const next = operations.get(`batch-1-${i + 1}`);
        operations.set(next.id, { ...next, status: 'RUNNING' });
      }
      await percent(1, (i + 1) * 10);
    }
    assert.ok(
      (await panel(1).locator('.completion-notice').innerText()).includes(
        'Importación completada. Los 10 archivos finalizaron correctamente.',
      ),
    );
    assert.ok((await panel(1).locator('.final-summary').innerText()).includes('Procesados: 100'));
    await panel(1).getByRole('button', { name: 'Cerrar aviso del envío 1', exact: true }).click();
    const readCount = statusReads;
    await page.waitForTimeout(3200);
    assert.equal(await panel(1).locator('.completion-notice').count(), 0);
    assert.ok(await panel(1).locator('.final-summary').isVisible());
    assert.equal(statusReads, readCount);
    await page.getByRole('button', { name: 'Anteriores', exact: true }).click();
    await page.waitForTimeout(1600);
    assert.ok(await first.locator('details').evaluate((e) => e.open));
    await upload(1);
    await panel(2).waitFor();
    await percent(2, 0);
    offline = true;
    await page.getByText('No se pudo actualizar 1 operación(es).', { exact: false }).waitFor();
    assert.ok((await panel(2).innerText()).includes('0 de 1 archivos finalizados'));
    offline = false;
    operations.set('batch-2-0', {
      ...operations.get('batch-2-0'),
      status: 'COMPLETED_WITH_REJECTIONS',
      totalRead: 4,
      processed: 2,
      rejected: 2,
      pending: 0,
    });
    await percent(2, 100);
    assert.ok(
      (await panel(2).locator('.completion-notice').innerText()).includes(
        'finalizada con observaciones',
      ),
    );
    const rejectedRow = page
      .locator('tbody tr')
      .filter({ hasText: 'synthetic-2015.csv' })
      .filter({ hasText: 'Completado con rechazos' })
      .first();
    for (let i = 0; i < 2; i++) {
      await rejectedRow
        .getByRole('button', { name: 'Ver rechazos de synthetic-2015.csv', exact: true })
        .click();
      await dialog.locator('article').nth(1).waitFor();
      assert.equal(await dialog.locator('article').count(), 2);
      await dialog.getByRole('button', { name: 'Cerrar rechazos', exact: true }).click();
    }
    await upload(1);
    await panel(3).waitFor();
    operations.set('batch-3-0', {
      ...operations.get('batch-3-0'),
      status: 'PARTIAL',
      processed: 1,
      pending: 2,
      message: 'Sincronización pendiente',
    });
    await percent(3, 100);
    assert.ok(
      (await panel(3).locator('.completion-notice').innerText()).includes(
        'finalizada con incidencias',
      ),
    );
    assert.ok(!(await panel(3).innerText()).includes('finalizó correctamente'));
    await panel(3)
      .getByRole('button', {
        name: 'Reintentar archivo synthetic-2015.csv del envío 3',
        exact: true,
      })
      .click();
    await panel(4).waitFor();
    assert.equal(retryRequests, 1);
    assert.ok((await panel(3).innerText()).includes('Pendientes: 2'));
    const retry = operations.get('batch-3-0');
    operations.set(retry.id, {
      ...retry,
      status: 'COMPLETED',
      totalRead: 3,
      processed: 3,
      pending: 0,
    });
    await percent(4, 100);
    assert.ok((await panel(4).innerText()).includes('El archivo finalizó correctamente'));
    assert.equal(await panel(1).locator('.completion-notice').count(), 0);
    await panel(4).screenshot({ path: path.join(output, 'desktop-completed.png') });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await panel(4).scrollIntoViewIfNeeded();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `Desbordamiento con ancho ${width}`,
      );
      const box = await panel(4).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
      if (width === 390)
        await panel(4).screenshot({ path: path.join(output, 'mobile-completed.png') });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log(
      JSON.stringify(
        {
          result: 'PASS',
          simulatedUploads: batches,
          simulatedRetries: retryRequests,
          historyPolls,
          statusReads,
          backendWrites: 0,
          checks: [
            '10 queued/sequential 0–100%',
            'observed counters',
            'names and historical isolation',
            'success/rejections/partial/retry',
            'one-time notices and persistent summaries',
            'history pagination',
            'error recovery',
            'details and rejection dialog across polling',
            '390/1440px without overflow',
          ],
          screenshots: output,
        },
        null,
        2,
      ),
    );
    await context.close();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
