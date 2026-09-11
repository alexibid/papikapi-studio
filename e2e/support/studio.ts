import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STUDIO_I18N_CONFIG } from '../../src/app/i18n.config';

const PT = STUDIO_I18N_CONFIG.translations['pt'];
const EN_TABLE = STUDIO_I18N_CONFIG.translations['en'];
const FIXTURES = join(__dirname, '..', 'fixtures');

export const t = (key: string): string => PT[key];
export const EN = (key: string): string => EN_TABLE[key];

export const TITLE = '.p-studio__title';
export const MODEL = '.p-studio__model';
export const CHOSEN = '.p-studio__model--chosen';
export const MESH_BADGE = '.p-studio__badge';
export const NET = '.p-studio__net';
export const NET_LINK = '.p-studio__net-links a';
export const SHELF = '.p-studio__shelf';
export const SHELF_LIVE = '.p-studio__shelf--live';
export const SWATCH = '.p-studio__swatch';
export const DIFFICULTY = '.p-studio__difficulty-select';
export const MADE = '.p-studio__made';
export const MADE_SUMMARY = '.p-studio__made-summary';
export const MADE_LIST = '.p-studio__made-list';
export const FACTS = '.p-studio__facts li';
export const CANVAS = '.c-viewer-3d__canvas';
export const COUNTS = '.c-viewer-3d__counts';

export async function freezeClock(page: Page, epochMs: number): Promise<void> {
  await page.clock.setFixedTime(new Date(epochMs));
}

export async function openSeeded(page: Page, path = '/'): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('ibid_lang', 'pt'));
  await page.route('**/uploads/gallery.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: readFileSync(join(FIXTURES, 'gallery.json'), 'utf8'),
    })
  );
  await page.route('**/uploads/**/model.glb', (route) =>
    route.fulfill({ contentType: 'model/gltf-binary', body: readFileSync(join(FIXTURES, 'model.glb')) })
  );
  await page.route('**/uploads/**/nets/*.pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: readFileSync(join(FIXTURES, 'net.pdf')) })
  );
  await page.goto(path);
}

export async function paintedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!canvas || !gl || canvas.width === 0) {
      return 0;
    }
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let painted = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) {
        painted += 1;
      }
    }
    return painted;
  });
}
