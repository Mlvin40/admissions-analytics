// Comprueba únicamente lecturas sobre la importación existente, sin enviar CSV ni reintentar cargas
const { chromium } = require(process.env.BD2_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.BD2_BASE_URL || 'http://127.0.0.1:4200';
const output = path.resolve(__dirname, '../../.local/browser-csv');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BD2_CHROME || '/usr/bin/google-chrome',
    headless: true,
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    let polls = 0;
    await context.route('**/api/**', (route) => {
      if (route.request().method() !== 'GET') {
        writes.push(route.request().method());
        return route.abort();
      }
      return route.continue();
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/imports') polls++;
    });
    await page.goto(base + '/data-import');
    const row = page.locator('tbody tr').filter({ hasText: 'rejection-check.csv' });
    const other = page.locator('tbody tr').filter({ hasNotText: 'rejection-check.csv' }).first();
    await row.waitFor();
    await row.locator('summary').click();
    await other.locator('summary').click();
    const first = await row.locator('details').elementHandle();
    const second = await other.locator('details').elementHandle();
    const pollingStart = polls;
    await page.waitForTimeout(12500);
    assert.ok(polls - pollingStart >= 6, 'El refresco debe continuar');
    assert.deepEqual(await first.evaluate((e) => ({ open: e.open, connected: e.isConnected })), {
      open: true,
      connected: true,
    });
    assert.deepEqual(await second.evaluate((e) => ({ open: e.open, connected: e.isConnected })), {
      open: true,
      connected: true,
    });
    await row.locator('summary').click();
    assert.equal(await first.evaluate((e) => e.open), false);
    assert.equal(await second.evaluate((e) => e.open), true);
    assert.ok(await page.getByRole('button', { name: 'Anteriores', exact: true }).isDisabled());
    const listed = await (
      await context.request.get(base + '/api/imports?offset=0&limit=50')
    ).json();
    assert.equal(
      await page.getByRole('button', { name: 'Siguientes', exact: true }).isDisabled(),
      listed.length < 50,
    );
    const job = listed.find((j) => j.fileName === 'rejection-check.csv');
    assert.ok(job);
    assert.equal(job.totalRead, 4);
    assert.equal(job.processed, 2);
    assert.equal(job.rejected, 2);
    assert.equal(job.pending, 0);
    const real = await (
      await context.request.get(base + `/api/imports/${job.id}/rejections?offset=0&limit=25`)
    ).json();
    assert.equal(real.total, 2);
    assert.deepEqual(
      real.items.map((r) => r.recordNumber),
      [2, 4],
    );
    const button = row.getByRole('button', {
      name: 'Ver rechazos de rejection-check.csv',
      exact: true,
    });
    const dialog = page.getByRole('dialog', {
      name: 'Rechazos de rejection-check.csv',
      exact: true,
    });
    async function open() {
      const pending = page.waitForResponse((r) => r.url().includes(`/${job.id}/rejections?`));
      await button.click();
      const response = await pending;
      await dialog.waitFor();
      return response;
    }
    await open();
    await dialog.locator('article').nth(1).waitFor();
    const bounds = await dialog.boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 1001);
    assert.equal(await dialog.locator('article').count(), 2);
    for (const item of real.items) {
      assert.ok((await dialog.innerText()).includes('Registro ' + item.recordNumber));
      assert.ok((await dialog.innerText()).includes(item.reason));
    }
    const article = await dialog.locator('article').first().elementHandle();
    await dialog.locator('article summary').first().click();
    assert.ok((await dialog.locator('pre').first().innerText()).includes('wrong'));
    await page.waitForTimeout(11000);
    assert.ok(await dialog.isVisible());
    assert.ok(await article.evaluate((e) => e.isConnected));
    assert.ok(
      await dialog
        .locator('article details')
        .first()
        .evaluate((e) => e.open),
    );
    await page.mouse.click(5, 5);
    assert.ok(await dialog.isVisible());
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, 'rejections-desktop.png') });
    await dialog.getByRole('button', { name: 'Cerrar rechazos', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForTimeout(2000);
    assert.equal(await dialog.isVisible(), false);
    await open();
    await dialog.locator('article').nth(1).waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    // Páginas de un registro obtenidas del endpoint real, sin cambiar el servicio ni los archivos históricos
    const pattern = `**/api/imports/${job.id}/rejections?*`;
    await page.route(pattern, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('limit', '1');
      const response = await route.fetch({ url: url.toString() });
      await route.fulfill({ response });
    });
    await open();
    await dialog.locator('article').first().waitFor();
    assert.equal(await dialog.locator('article').count(), 1);
    assert.ok((await dialog.innerText()).includes('Registro 2'));
    let pending = page.waitForResponse(
      (r) =>
        new URL(r.url()).searchParams.get('offset') === '1' && r.url().includes('/rejections?'),
    );
    await dialog.getByRole('button', { name: 'Rechazos siguientes', exact: true }).click();
    await pending;
    await dialog.getByRole('heading', { name: 'Registro 4', exact: true }).waitFor();
    assert.ok(
      await dialog.getByRole('button', { name: 'Rechazos siguientes', exact: true }).isDisabled(),
    );
    pending = page.waitForResponse(
      (r) =>
        new URL(r.url()).searchParams.get('offset') === '0' && r.url().includes('/rejections?'),
    );
    await dialog.getByRole('button', { name: 'Rechazos anteriores', exact: true }).click();
    await pending;
    await dialog.getByRole('heading', { name: 'Registro 2', exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Cerrar rechazos', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.unroute(pattern);
    await page.route(pattern, async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ response });
    });
    pending = open();
    await dialog.getByText('Consultando rechazos…', { exact: true }).waitFor();
    await pending;
    await dialog.locator('article').nth(1).waitFor();
    await dialog.getByRole('button', { name: 'Cerrar rechazos', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.unroute(pattern);
    await page.route(pattern, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'private details' }),
      }),
    );
    await open();
    await dialog.getByText('No se pudo completar la solicitud.', { exact: false }).waitFor();
    assert.ok(!(await dialog.innerText()).includes('private details'));
    await page.unroute(pattern);
    await dialog
      .getByRole('button', { name: 'Reintentar consulta de rechazos', exact: true })
      .click();
    await dialog.locator('article').nth(1).waitFor();
    await dialog.getByRole('button', { name: 'Cerrar diálogo de rechazos', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.route(pattern, async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('offset', '2');
      url.searchParams.set('limit', '1');
      const response = await route.fetch({ url: url.toString() });
      await route.fulfill({ response });
    });
    await open();
    await dialog
      .getByText('No hay registros rechazados en esta página.', { exact: true })
      .waitFor();
    await dialog.getByRole('button', { name: 'Cerrar rechazos', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.unroute(pattern);
    await page.route('**/api/imports?*', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    await page.getByText('No se pueden actualizar los resultados.', { exact: false }).waitFor();
    assert.ok(await second.evaluate((e) => e.isConnected && e.open));
    await page.unroute('**/api/imports?*');
    await page
      .getByText('No se pueden actualizar los resultados.', { exact: false })
      .waitFor({ state: 'hidden' });
    assert.ok(await second.evaluate((e) => e.isConnected && e.open));
    await page.setViewportSize({ width: 375, height: 812 });
    await open();
    await dialog.locator('article').nth(1).waitFor();
    const mobile = await dialog.boundingBox();
    assert.ok(
      mobile &&
        mobile.x >= 0 &&
        mobile.y >= 0 &&
        mobile.x + mobile.width <= 376 &&
        mobile.y + mobile.height <= 813,
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, 'rejections-mobile.png') });
    await dialog.getByRole('button', { name: 'Cerrar rechazos', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    const report = {
      processingDetails: 'Open for 12.5 seconds across polling; DOM reused; independent close',
      rejectionRecords: real.items.map((r) => ({ recordNumber: r.recordNumber, reason: r.reason })),
      dialog:
        'Open across 11 seconds of polling; explicit close, reopen, Escape, mask, pagination, loading, 503/retry, empty, desktop/mobile',
      polls,
      writes,
      errors,
    };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
