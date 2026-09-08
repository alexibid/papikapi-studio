import { expect, test } from '@playwright/test';
import { FlowRecorder } from '@ibid/testing';
import {
  CANVAS,
  CHOSEN,
  COUNTS,
  FACTS,
  MESH_BADGE,
  MODEL,
  NET,
  NET_LINK,
  SCRIPT,
  SHELF,
  SHELF_LIVE,
  SWATCH,
  TITLE,
  freezeClock,
  openSeeded,
  paintedPixels,
  t,
} from '../support/studio';

test.describe('Kirigami Studio catalogue', () => {
  test('walks every shelf, the printed nets and the assembled preview', async ({ page }, testInfo) => {
    const recorder = new FlowRecorder(page, testInfo, 'catalogue');
    await freezeClock(page, 1_700_000_000_000);
    await openSeeded(page, '/');

    await expect(page.locator(TITLE)).toHaveText(t('appName'));
    await expect(page.locator(SHELF)).toHaveText([
      `${t('ready')} · 1`,
      `${t('draft')} · 2`,
      `${t('backup')} · 1`,
    ]);
    await expect(page.locator(SHELF_LIVE)).toHaveText(`${t('ready')} · 1`);
    await expect(page.locator(MODEL)).toHaveCount(1);
    await expect(page.locator(CHOSEN)).toHaveCount(1);
    await recorder.step(1, 'open the studio', 'the approved shelf opens with its one model');

    await expect(page.locator(MESH_BADGE)).toHaveText(t('zeroOffenders'));
    await expect(page.locator(FACTS)).toHaveText([
      `3 ${t('parts')}`,
      `36 ${t('faces')}`,
      `4 ${t('printedPages')}`,
      `4 ${t('printedColours')}`,
    ]);
    await expect(page.locator(SWATCH)).toHaveCount(4);
    await recorder.step(2, 'read the mesh report', 'zero offenders, and every colour it prints in');

    await expect(page.locator(NET)).toHaveCount(3);
    await expect(page.locator(SCRIPT)).toHaveAttribute(
      'href',
      '/uploads/ready/rocket-pad/model.py'
    );
    await expect(page.locator(NET_LINK).first()).toHaveAttribute(
      'href',
      '/uploads/ready/rocket-pad/nets/ground.pdf'
    );
    await expect(page.locator(NET).nth(1).locator('a')).toHaveText(['PDF', 'SVG 1', 'SVG 2']);
    await recorder.step(3, 'read the nets', 'a PDF and an SVG page per welded part, plus the script');

    await expect(page.locator(CANVAS)).toBeVisible();
    await expect(page.locator(COUNTS)).toContainText(`3 ${t('parts')}`);
    await expect.poll(() => paintedPixels(page)).toBeGreaterThan(500);
    await recorder.step(4, 'watch the viewer', 'three.js draws the assembled GLB');

    await page.locator(SHELF).nth(1).click();

    await expect(page.locator(SHELF_LIVE)).toHaveText(`${t('draft')} · 2`);
    await expect(page.locator(MODEL)).toHaveCount(2);
    await expect(page.locator(SWATCH)).toHaveCount(3);
    await recorder.step(5, 'switch to the drafts', 'the shelf swaps and the fox is selected');

    await page.locator(MODEL).nth(1).click();

    await expect(page.locator(MESH_BADGE)).toHaveText(t('offendersFound'));
    await expect(page.locator(NET)).toHaveCount(1);
    await recorder.step(6, 'choose the dirty draft', 'the report flags the offenders');

    await page.locator(SHELF).nth(2).click();

    await expect(page.locator(SHELF_LIVE)).toHaveText(`${t('backup')} · 1`);
    await expect(page.locator(MODEL)).toHaveCount(1);
    await expect(page.locator(NET)).toHaveCount(1);
    await recorder.step(7, 'open the backups', 'the earlier run is kept and still opens');

    await page.reload();

    await expect(page.locator(SHELF_LIVE)).toHaveText(`${t('ready')} · 1`);
    await expect(page.locator(MESH_BADGE)).toHaveText(t('zeroOffenders'));
    await recorder.step(8, 'reload', 'the catalogue comes back from disk on the approved shelf');
  });
});
