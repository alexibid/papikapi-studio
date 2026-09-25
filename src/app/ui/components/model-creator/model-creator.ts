import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BadgeComponent, ButtonComponent, CardComponent, TextareaComponent } from 'ibid-ui';
import { I18nService } from '@ibid/services';
import { ModelCreatorService } from '../../../application/services/model-creator.service';

import { ProcessLoaderComponent } from '../process-loader/process-loader';

interface ReferenceFile {
  readonly id: string;
  readonly name: string;
  readonly dataUrl: string;
}

@Component({
  selector: 'kirigami-model-creator',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    TextareaComponent,
    ProcessLoaderComponent,
  ],
  templateUrl: './model-creator.html',
  styleUrl: './model-creator.scss',
})
export class ModelCreatorComponent {
  protected readonly creator = inject(ModelCreatorService);
  protected readonly i18n = inject(I18nService);

  @Output() readonly pickSelected = new EventEmitter<{ name: string; pick: number }>();
  @Output() readonly modelCreated = new EventEmitter<string>();
  @Output() readonly closed = new EventEmitter<void>();

  protected readonly prompt = signal<string>('');
  protected readonly modelName = signal<string>('');
  protected readonly references = signal<readonly ReferenceFile[]>([]);
  protected readonly selectedPick = signal<number | null>(3);
  protected readonly mathFloor = Math.floor;

  protected readonly cellLabels: readonly string[] = [
    '1. Chibi / Toddler',
    '2. Playful / Youth',
    '3. Signature Style (Default)',
    '4. Structured / Classic',
    '5. Detailed / Angular',
    '6. Adult / Realistic',
  ];

  protected onPromptChange(value: string): void {
    this.prompt.set(value);
    if (!this.modelName() || this.modelName().startsWith('model-')) {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 20);
      if (slug) {
        this.modelName.set(slug);
      }
    }
  }

  protected onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files).slice(0, 3 - this.references().length);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const newRef: ReferenceFile = {
            id: Math.random().toString(36).substring(2, 9),
            name: file.name,
            dataUrl: reader.result,
          };
          this.references.update((current) => {
            if (current.length >= 3) return current;
            return [...current, newRef];
          });
        }
      };
      reader.readAsDataURL(file);
    }
    input.value = '';
  }

  protected removeReference(id: string): void {
    this.references.update((refs) => refs.filter((r) => r.id !== id));
  }

  protected async generateAlternatives(): Promise<void> {
    const p = this.prompt().trim();
    if (!p) return;
    const name = (this.modelName().trim() || 'custom-model').toLowerCase().replace(/\s+/g, '-');
    this.selectedPick.set(null);
    const images = this.references().map((r) => r.dataUrl);

    await this.creator.generateAlternatives(name, p, images);
  }

  protected selectCell(pick: number): void {
    this.selectedPick.set(pick);
  }

  protected isPickCached(pick: number): boolean {
    return this.creator.cachedPicks().includes(pick);
  }

  protected isPickActive(pick: number): boolean {
    return this.creator.currentPick() === pick;
  }

  protected isSelectedCached(): boolean {
    const p = this.selectedPick();
    return p !== null && this.isPickCached(p);
  }

  protected advanceWithPick(): void {
    const pick = this.selectedPick();
    const name = this.creator.currentName();
    if (!pick || !name) return;

    this.pickSelected.emit({ name, pick });
  }

  protected close(): void {
    this.creator.reset();
    this.closed.emit();
  }
}
