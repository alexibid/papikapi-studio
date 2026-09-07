import { expect, test } from '@playwright/test';
import { FlowRecorder } from '@ibid/testing';

test.describe('Tyrannosaurus Rex 3D Assembly', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ibid_lang', 'pt');
    });
  });

  test('folds the 3.svg Tyrannosaurus Rex step-by-step in 3D and records steps', async ({ page }, testInfo) => {
    const recorder = new FlowRecorder(page, testInfo, 'tyrannosaurus-3d');

    await page.goto('/lab?figure=tyrannosaurus');
    await expect(page.locator('.p-lab__title')).toHaveText('Generation Lab');

    const canvas = page.locator('.c-viewer-3d__canvas');
    await expect(canvas).toBeVisible();

    await page.getByRole('button', { name: 'Início' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Molde Plano/);
    await page.waitForTimeout(400);
    await recorder.step(1, 'flat-sheet', 'unfolded T-Rex sheet lying flat on the surface');

    await page.getByRole('button', { name: 'Dobra seguinte' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Dobra 1 de 4/);
    await page.waitForTimeout(400);
    await recorder.step(2, 'spine-folded', 'dorsal spine mountain fold raises torso and tail');

    await page.getByRole('button', { name: 'Dobra seguinte' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Dobra 2 de 4/);
    await page.waitForTimeout(400);
    await recorder.step(3, 'skull-folded', 'skull folds with open jaws and sharp teeth');

    await page.getByRole('button', { name: 'Dobra seguinte' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Dobra 3 de 4/);
    await page.waitForTimeout(400);
    await recorder.step(4, 'legs-folded', 'hind legs fold downwards to ground');

    await page.getByRole('button', { name: 'Dobra seguinte' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Boneco Montado/);
    await page.waitForTimeout(400);
    await recorder.step(5, 'fully-assembled', 'T-Rex standing upright on two legs with open mouth');
  });
});
