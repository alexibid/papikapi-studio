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
  selector: 'papikapi-studio-model-creator',
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

  protected deriveFigureSlug(text: string): string {
    const raw = (text ?? '').trim();
    if (!raw) return '';

    // Strip boilerplate studio prefixes if present
    let subject = raw
      .replace(/^low-poly\s+faceted\s+3d\s+papercraft\s+model\s+of\s+/i, '')
      .replace(/\s+seen\s+in\s+an\s+eye-level[\s\S]*$/i, '');

    const subjectMatch = subject.match(/(?:^|\n)Subject:\s*([^\n.]+)/i);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
    } else {
      subject = subject.split(/[\n.;]|\s+(?:seen\s+in|with\s+all\s+feet)\b/i)[0].trim();
    }

    if (/\b(snoopy|snoopi)\b/i.test(subject)) {
      return /\b(peluche|pelucia|plush|boneco|toy)\b/i.test(subject) ? 'snoopy-plush' : 'snoopy';
    }
    if (/\b(pac-man|pacman)\b/i.test(subject)) return 'pac-man';
    if (/\b(mario)\b/i.test(subject)) return 'mario';
    if (/\b(sonic)\b/i.test(subject)) return 'sonic';
    if (/\b(pikachu)\b/i.test(subject)) return 'pikachu';
    if (/\b(kirby)\b/i.test(subject)) return 'kirby';
    if (/\b(yoshi)\b/i.test(subject)) return 'yoshi';
    if (/\b(darth)\b/i.test(subject)) return /\b(cat|gato)\b/i.test(subject) ? 'cat-darth' : 'darth';

    const normalized = subject
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^(?:um|uma|uns|umas|o|a|os|as|the|an)-+/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return (
      normalized
        .replace(/^(?:a-cute|cute|a)-+/i, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
        .replace(/-+$/, '') || 'model'
    );
  }

  protected onPromptChange(value: string): void {
    this.prompt.set(value);
    if (!this.modelName() || this.modelName().startsWith('model-') || this.modelName() === 'custom-model') {
      const slug = this.deriveFigureSlug(value);
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
    const rawName = this.modelName().trim();
    const name = (rawName ? this.deriveFigureSlug(rawName) : this.deriveFigureSlug(p)) || 'custom-model';
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
