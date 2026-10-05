import { Injectable, signal } from '@angular/core';
import { ModelCost, NO_COST, readModelCost } from '../../domain/models/model-cost';

@Injectable({ providedIn: 'root' })
export class ModelCostService {
  private readonly current = signal<ModelCost>(NO_COST);

  readonly cost = this.current.asReadonly();

  async load(modelId: string): Promise<void> {
    try {
      const response = await fetch(`/models/${modelId}/manifest.json`, { cache: 'no-store' });
      this.current.set(response.ok ? readModelCost(await response.json()) : NO_COST);
    } catch {
      this.current.set(NO_COST);
    }
  }
}
