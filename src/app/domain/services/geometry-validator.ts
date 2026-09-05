import { PaperModel, UnfoldedSheet } from '../models/kirigami-model';

export interface ValidationReport {
  readonly isValid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function validateKirigamiGeometry(
  model: PaperModel,
  sheet: UnfoldedSheet
): ValidationReport {
  const errors: string[] = [...sheet.validationErrors];
  const warnings: string[] = [];

  if (model.boxes.length === 0) {
    errors.push('Model contains no 3D boxes.');
  }

  for (const box of model.boxes) {
    if (box.width <= 0 || box.height <= 0 || box.depth <= 0) {
      errors.push(`Box '${box.id}' has invalid zero or negative dimensions.`);
    }
    if (box.width < 8 || box.height < 8 || box.depth < 8) {
      warnings.push(`Box '${box.id}' is under 8mm, which may be tricky for child hands to fold.`);
    }
  }

  for (let i = 0; i < sheet.parts.length; i++) {
    const partA = sheet.parts[i];

    if (partA.x + partA.width > sheet.width - 8) {
      errors.push(`Part '${partA.id}' extends past the printable right margin.`);
    }
    if (partA.y + partA.height > sheet.height - 8) {
      errors.push(`Part '${partA.id}' extends past the printable bottom margin.`);
    }

    for (let j = i + 1; j < sheet.parts.length; j++) {
      const partB = sheet.parts[j];
      if (checkAABBOverlap(partA, partB)) {
        errors.push(`Parts '${partA.id}' and '${partB.id}' overlap on the printable sheet.`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function checkAABBOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}
