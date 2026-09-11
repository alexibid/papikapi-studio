import { expect, test } from '@playwright/test';
import { FlowRecorder } from '@ibid/testing';
import {
  CANVAS,
  CHOSEN,
  COUNTS,
  DIFFICULTY,
  FACTS,
  MADE,
  MADE_LIST,
  MADE_SUMMARY,
  MESH_BADGE,
  MODEL,
  NET,
  NET_LINK,
  SHELF,
  SHELF_LIVE,
  SWATCH,
  freezeClock,
  openSeeded,
  paintedPixels,
  t,
} from '../support/studio';

test.describe('Kirigami Studio catalogue', () => {
  test('opens a grid model, changes its difficulty and keeps it across a reload', async ({ page }, testInfo) => {
    const recorder = new FlowRecorder(page, testInfo, 'catalogue');
    await freezeClock(page, 1_700_000_000_000);
    await openSeeded(page, '/');

    await expect(page.locator(SHELF)).toHaveText([`${t('ready')} · 0`, `${t('draft')} · 1`]);
    await expect(page.locator(SHELF_LIVE)).toHaveText(`${t('draft')} · 1`);
    await expect(page.locator(MODEL)).toHaveCount(1);
    await expect(page.locator(CHOSEN)).toContainText('Baby Broncosaurus');
    await recorder.step(1, 'open the studio', 'the draft shelf opens on its one subject');

    await expect(page.locator(MESH_BADGE)).toHaveText(t('zeroOffenders'));
    await expect(page.locator(DIFFICULTY)).toHaveValue('3');
    await expect(page.locator(`${DIFFICULTY} option`)).toHaveCount(5);
    await expect(page.locator(FACTS)).toHaveText([
      `1 ${t('parts')}`,
      `591 ${t('faces')}`,
      `2 ${t('printedPages')}`,
      `1 ${t('printedColours')}`,
    ]);
    await expect(page.locator(SWATCH)).toHaveCount(1);
    await recorder.step(2, 'read the mesh report', 'five intensities, opening on the middle one');

    await expect(page.locator(CANVAS)).toBeVisible();
    await expect(page.locator(COUNTS)).toContainText(`1 ${t('parts')}`);
    await expect.poll(() => paintedPixels(page)).toBeGreaterThan(500);
    await recorder.step(3, 'watch the viewer', 'three.js draws the grid mesh');

    await page.locator(DIFFICULTY).selectOption('5');

    await expect(page.locator(FACTS).nth(1)).toHaveText(`924 ${t('faces')}`);
    await expect.poll(() => paintedPixels(page)).toBeGreaterThan(500);
    await recorder.step(4, 'raise the difficulty', 'the hardest grid loads and the face count follows');

    await page.locator(DIFFICULTY).selectOption('1');

    await expect(page.locator(FACTS).nth(1)).toHaveText(`338 ${t('faces')}`);
    await recorder.step(5, 'drop to the easiest', 'the lightest grid loads, fewest cuts to make');

    await expect(page.locator(MADE_LIST)).toBeHidden();
    await page.locator(MADE_SUMMARY).click();

    await expect(page.locator(MADE)).toHaveAttribute('open', '');
    await expect(page.locator(MADE_LIST)).toContainText('Apple M4');
    await expect(page.locator(MADE_LIST)).toContainText('cutout');
    await expect(page.locator(MADE_LIST)).toContainText('71.13s');
    await recorder.step(6, 'open how it was made', 'the provenance is folded away until asked for');

    await expect(page.locator(NET)).toHaveCount(1);
    await expect(page.locator(NET_LINK).first()).toHaveAttribute(
      'href',
      '/uploads/models/baby-broncosaurus/nets/subject.pdf'
    );
    await expect(page.locator(NET).first().locator('a')).toHaveText(['PDF', 'SVG 1', 'SVG 2']);
    await recorder.step(7, 'read the net', 'one PDF and the two printed pages');

    await page.reload();

    await expect(page.locator(SHELF_LIVE)).toHaveText(`${t('draft')} · 1`);
    await expect(page.locator(DIFFICULTY)).toHaveValue('3');
    await expect.poll(() => paintedPixels(page)).toBeGreaterThan(500);
    await recorder.step(8, 'reload', 'the catalogue comes back from disk on the middle intensity');
  });
});
