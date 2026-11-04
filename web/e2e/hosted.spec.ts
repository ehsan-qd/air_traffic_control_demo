import { expect, test } from '@playwright/test';

test.skip(!process.env.NAT_TEST_HOSTED, 'Run against the combined production build with NAT_TEST_HOSTED=1.');

test('hosted walkthrough, TV loop and companion apps work without a backend', async ({ page, request }) => {
  const errors: string[] = [];
  const backendRequests: string[] = [];
  const sockets: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('websocket', ws => sockets.push(ws.url()));
  page.on('request', r => { if (/\/api\/(control|wind|state)/.test(r.url())) backendRequests.push(r.url()); });
  await page.goto('/demonstrator#explore');
  await expect(page.getByRole('button', { name: 'Start the walkthrough' })).toBeEnabled();
  await expect(page.locator('.intro-map .plane').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore the live system' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start the walkthrough' }).click();
  for (const label of ['The ask', 'The conflict', 'The options', 'ORBIT decides', 'The clearance', 'Proven at scale', 'What’s next']) {
    await expect(page.locator('.story-steps [aria-current]')).toContainText(label);
    if (label === 'The clearance') await expect(page.locator('.verified-badge')).toBeVisible();
    if (label !== 'What’s next') await page.keyboard.press('ArrowRight');
  }
  await expect(page.getByRole('button', { name: 'Explore the live system' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to overview' }).first().click();
  await expect(page.getByRole('button', { name: 'Start the walkthrough' })).toBeVisible();
  await page.goto('/loop_demo');
  await expect(page.locator('.loop-plane').first()).toBeVisible();
  await page.goto('/presentation');
  await expect(page.locator('.presentation-shell')).toBeVisible();
  await page.goto('/demo');
  await expect(page.getByRole('link', { name: 'Back to presentation' })).toHaveAttribute('href', '/presentation');
  for (const paper of ['sesar', 'formulation']) {
    const response = await request.get(`/api/papers/${paper}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect((await response.body()).subarray(0, 4).toString()).toBe('%PDF');
  }
  expect(backendRequests).toEqual([]);
  expect(sockets).toEqual([]);
  expect(errors).toEqual([]);
});
