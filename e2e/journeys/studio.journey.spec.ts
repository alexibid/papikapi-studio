import { expect, test } from '@playwright/test';

test.describe('Kirigami Studio Journey', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ibid_lang', 'pt');
    });
  });

  test('renders 3D WebGL model, printable sheet, fold-by-fold step navigation, and export actions', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.p-studio__title')).toHaveText('Kirigami Studio');
    await expect(page.locator('.p-studio__badge--success')).toHaveText('Geometria 100% Válida');

    const canvas = page.locator('.c-viewer-3d__canvas');
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThan(150);
    expect(canvasBox!.height).toBeGreaterThan(150);

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const canvasEl = document.querySelector('.c-viewer-3d__canvas') as HTMLCanvasElement | null;
        if (!canvasEl) return 0;
        const gl = canvasEl.getContext('webgl2') || canvasEl.getContext('webgl');
        if (!gl) return 0;
        const width = canvasEl.width;
        const height = canvasEl.height;
        if (width === 0 || height === 0) return 0;
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let nonZeroCount = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 0 || pixels[i + 1] > 0 || pixels[i + 2] > 0 || pixels[i + 3] > 0) {
            nonZeroCount++;
          }
        }
        return nonZeroCount;
      });
    }).toBeGreaterThan(500);

    await expect(page.locator('.p-studio__subtitle')).toHaveText('modelDino');
    await expect(page.locator('.c-viewer-3d__box')).toHaveCount(8);

    await page.getByRole('button', { name: 'Dragão' }).click();
    await expect(page.locator('.p-studio__subtitle')).toHaveText('modelDragon');
    await expect(page.locator('.c-viewer-3d__box')).toHaveCount(11);
    await expect(page.locator('.p-studio__badge--success')).toHaveText('Geometria 100% Válida');

    await expect(page.locator('.c-viewer-3d__timeline')).toBeVisible();
    await expect(page.locator('.c-viewer-3d__play-btn')).toBeVisible();

    await page.getByRole('button', { name: 'Início' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Molde Plano/);

    await page.getByRole('button', { name: 'Dobra seguinte' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Dobra 1 de/);

    await page.getByRole('button', { name: 'Dobra seguinte' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Dobra 2 de/);

    await page.getByRole('button', { name: 'Dobra anterior' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Dobra 1 de/);

    await page.getByRole('button', { name: 'Fim' }).click();
    await expect(page.locator('.c-viewer-3d__step-badge')).toHaveText(/Boneco Montado/);

    await page.getByRole('button', { name: 'Pinguim' }).click();
    await expect(page.locator('.p-studio__subtitle')).toHaveText('modelPenguin');
    await expect(page.locator('.c-viewer-3d__box')).toHaveCount(7);
    await expect(page.locator('.p-studio__badge--success')).toHaveText('Geometria 100% Válida');

    await page.getByRole('button', { name: 'Casinha' }).click();
    await expect(page.locator('.p-studio__subtitle')).toHaveText('modelHouse');
    await expect(page.locator('.c-viewer-3d__box')).toHaveCount(3);
    await expect(page.locator('.p-studio__badge--success')).toHaveText('Geometria 100% Válida');

    const sheetTabBtn = page.getByRole('button', { name: /Molde PDF A4/ });
    await sheetTabBtn.click();

    const sheetSvg = page.locator('.c-sheet-preview__svg');
    await expect(sheetSvg).toBeVisible();
    await expect(canvas).not.toBeVisible();

    const svgBox = await sheetSvg.boundingBox();
    expect(svgBox).not.toBeNull();
    expect(svgBox!.width).toBeGreaterThan(150);
    expect(svgBox!.height).toBeGreaterThan(150);

    await expect(page.locator('.c-sheet-preview__part').first()).toBeVisible();
    await expect(page.locator('.c-sheet-preview__net-body').first()).toBeVisible();
    await expect(page.locator('.c-sheet-preview__fold-line').first()).toBeAttached();
    await expect(page.locator('.c-sheet-preview__tab').first()).toBeAttached();

    await page.getByRole('button', { name: 'Contorno (Pintar)' }).click();
    await expect(page.locator('.c-sheet-preview')).toHaveClass(/c-sheet-preview--outline/);

    await page.getByRole('button', { name: 'Colorido' }).click();
    await expect(page.locator('.c-sheet-preview')).not.toHaveClass(/c-sheet-preview--outline/);

    await expect(page.getByRole('button', { name: 'Exportar PDF A4' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar SVG' })).toBeVisible();

    await page.getByRole('button', { name: 'Exportar TypeScript' }).click();
    await expect(page.locator('.p-studio__toast')).toBeVisible();

    const viewer3dTabBtn = page.getByRole('button', { name: /Visualizador 3D/ });
    await viewer3dTabBtn.click();
    await expect(canvas).toBeVisible();
    await expect(sheetSvg).not.toBeVisible();
  });
});
