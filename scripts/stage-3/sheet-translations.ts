import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PipelineConfigLoader } from '../common/pipeline-config.js';
import { WorkspacePaths } from '../common/workspace-paths.js';
import type {
  BookletTexts,
} from './interfaces/sheet-translations.interface.js';

export function fillTemplate(template: string, values: Readonly<Record<string, string | number>>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template);
}

export class SheetTranslations {
  public static forConfiguredLanguage(): BookletTexts {
    const { sheet_language: language, sheet_translations: relativePath } = PipelineConfigLoader.load().workspace;
    const file = join(WorkspacePaths.appRoot, relativePath);
    if (!existsSync(file)) {
      throw new Error(`Sheet translations not found at ${file}`);
    }
    const catalogue = JSON.parse(readFileSync(file, 'utf8')) as Record<string, BookletTexts>;
    const texts = catalogue[language];
    if (!texts) {
      throw new Error(`No sheet translation for language '${language}' in ${file}`);
    }
    return texts;
  }
}
