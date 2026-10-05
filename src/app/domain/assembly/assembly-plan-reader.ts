import { AssemblyPlan } from './assembly-plan';

export function readAssemblyPlan(payload: unknown): AssemblyPlan {
  if (!isPlan(payload)) {
    throw new Error('The assembly plan is malformed');
  }
  return payload;
}

function isPlan(value: unknown): value is AssemblyPlan {
  if (!isRecord(value) || !Array.isArray(value['pieces']) || value['pieces'].length === 0) {
    return false;
  }
  return value['pieces'].every(isPiece);
}

function isPiece(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value['faces']) || value['faces'].length === 0) {
    return false;
  }
  return (
    typeof value['progressStart'] === 'number' &&
    typeof value['progressEnd'] === 'number' &&
    Array.isArray(value['tray']) &&
    value['faces'].every(isFace)
  );
}

function isFace(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['parent'] === 'number' &&
    typeof value['depth'] === 'number' &&
    typeof value['colour'] === 'string' &&
    Array.isArray(value['polygon']) &&
    Array.isArray(value['solid'])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
