import { Injectable } from '@angular/core';
import { AssemblyPlan } from '../../domain/assembly/assembly-plan';
import { readAssemblyPlan } from '../../domain/assembly/assembly-plan-reader';

@Injectable({ providedIn: 'root' })
export class AssemblyPlanService {
  async load(url: string): Promise<AssemblyPlan> {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return readAssemblyPlan(await response.json());
  }
}
