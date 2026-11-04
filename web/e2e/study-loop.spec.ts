import { expect, test } from '@playwright/test';

const scenes = ['The ask', 'The conflict', 'The options', 'ORBIT decides', 'The clearance', 'Proven at scale', 'What’s next'];

test('the overview and seven-scene walkthrough play the recorded runs without the backend', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  const backendCommands: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/control')) backendCommands.push(request.postData() ?? ''); });
  await page.setViewportSize({ width:1440, height:900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name:/Don’t rock the boat/ })).toBeVisible();
  await expect(page.locator('.intro-map .plane').first()).toBeVisible();
  await page.getByRole('button', { name:'Start the walkthrough' }).click();
  await expect(page.getByRole('button', { name:'Pause simulation' })).toBeEnabled();

  // Presenter mode never waits: each scene jumps the run to the point its data exists.
  for (const [index, label] of scenes.entries()) {
    await expect(page.locator('.story-steps [aria-current]')).toContainText(label);
    await expect(page.locator('.story-waiting')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (index === 0) await expect(page.locator('.story-map .nominal-route')).toBeVisible();
    if (index === 1) {
      await expect(page.locator('.story-side')).toContainText('XAT208');
      await expect(page.locator('.encounter-label')).toBeVisible();
    }
    if (index === 2) {
      await expect(page.locator('.skeleton-view')).toBeVisible();
      await expect(page.locator('.story-side')).toContainText('1,321');
    }
    if (index === 3) await expect(page.locator('.sampling-stage .skeleton-view')).toHaveCount(3);
    if (index === 4) {
      await expect(page.locator('.verified-badge')).toBeVisible();
      await expect(page.getByRole('region', { name:'Cockpit view for XAT417' })).toBeVisible();
    }
    if (index === 5) await expect(page.locator('.tag-study')).toBeVisible();
    if (index === 6) {
      await expect(page.locator('.run-list>div')).toHaveCount(3);
      await expect(page.locator('.run-list')).toContainText('XAT417');
      await expect(page.getByRole('button', { name:'Explore the live system' }).first()).toBeVisible();
    }
    await expect.poll(async () => {
      const bounds = await page.locator('.story-nav').boundingBox();
      return !!bounds && bounds.y + bounds.height <= 900;
    }).toBe(true);
    await page.screenshot({ path:`test-results/story-scene-${index + 1}.png`, animations:'disabled' });
    if (index < scenes.length - 1) await page.keyboard.press('ArrowRight');
  }


  // The technical layer swaps the side panel without leaving the scene.
  await page.getByRole('button', { name:'Technical' }).click();
  await expect(page.locator('.story-side')).toContainText('This demo vs the study');
  await page.keyboard.press('t');
  await expect(page.locator('.story-side')).not.toContainText('This demo vs the study');

  // Autoplay seeks to the current scene's cue and runs the clock from there.
  await page.keyboard.press('2');
  await page.getByRole('button', { name:/Autoplay/ }).click();
  await expect(page.locator('.story-mode')).toContainText('0:1');

  // Restart and replay come straight back with the story flight ready.
  await page.getByRole('button', { name:'Restart walkthrough' }).click();
  await page.getByRole('button', { name:/Present/ }).click();
  await expect(page.locator('.story-steps [aria-current]')).toContainText('The ask');
  await expect(page.locator('.story-map .nominal-route')).toBeVisible();

  await page.setViewportSize({ width:390, height:844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name:'Exit walkthrough' }).click();
  await expect(page.getByRole('button', { name:'Start the walkthrough' })).toBeVisible();
  expect(backendCommands).toEqual([]);
  expect(errors).toEqual([]);
});
