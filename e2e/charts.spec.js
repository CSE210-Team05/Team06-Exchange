import { test, expect } from '@playwright/test';

const CSV = [
  'Time,Alpha,Beta',
  '0,10,20',
  '1,15,25',
  '2,20,30',
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#chart svg')).toBeVisible();

  await page.locator('#csv').fill(CSV);
  await page.getByRole('button', {
    name: 'Apply data',
    exact: true,
  }).click();

  await expect(
    page.locator('#series-controls').getByRole('checkbox', {
      name: 'Alpha',
      exact: true,
    }),
  ).toBeChecked();
});

test('series visibility survives switching to scatter', async ({ page }) => {
  const controls = page.locator('#series-controls');
  const alpha = controls.getByRole('checkbox', {
    name: 'Alpha',
    exact: true,
  });
  const beta = controls.getByRole('checkbox', {
    name: 'Beta',
    exact: true,
  });

  await expect(page.locator('#chart polyline.series')).toHaveCount(2);

  await alpha.uncheck();

  await expect(page.locator('#chart polyline.series')).toHaveCount(1);

  await page.getByRole('radio', {
    name: 'Scatter',
    exact: true,
  }).check();

  await expect(alpha).not.toBeChecked();
  await expect(beta).toBeChecked();
  await expect(page.locator('#chart g.markers circle')).toHaveCount(3);

  await beta.uncheck();
  await expect(page.locator('#chart .empty')).toHaveText(
    'No series selected',
  );

  await beta.check();
  await expect(page.locator('#chart g.markers circle')).toHaveCount(3);
});

test('invalid CSV preserves the previous chart and selection', async ({
  page,
}) => {
  const alpha = page.locator('#series-controls').getByRole('checkbox', {
    name: 'Alpha',
    exact: true,
  });

  await alpha.uncheck();

  const description = page.locator('#chart svg desc');
  const previousDescription = await description.textContent();

  await page.locator('#csv').fill('x,y\ninvalid,invalid');
  await page.getByRole('button', {
    name: 'Apply data',
    exact: true,
  }).click();

  await expect(page.locator('#status')).toHaveClass(/status-error/);
  await expect(description).toHaveText(previousDescription);
  await expect(alpha).not.toBeChecked();
  await expect(page.locator('#chart polyline.series')).toHaveCount(1);
});

test('zoom changes the view and reset restores it', async ({ page }) => {
  const description = page.locator('#chart svg desc');
  const originalDescription = await description.textContent();

  await page.getByRole('button', {
    name: 'Zoom in',
    exact: true,
  }).click();

  await expect(description).toContainText('Viewport:');
  await expect(description).not.toHaveText(originalDescription);

  await page.getByRole('button', {
    name: 'Reset view',
    exact: true,
  }).click();

  await expect(description).toHaveText(originalDescription);
});