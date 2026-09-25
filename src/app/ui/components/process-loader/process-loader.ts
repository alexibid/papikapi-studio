import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { I18nService } from '@ibid/services';

export interface ProcessStep {
  readonly id: string;
  readonly icon: string;
  readonly titleKey: string;
  readonly descKey: string;
}

export interface MilestoneRenderData {
  readonly index: number;
  readonly id: string;
  readonly title: string;
  readonly desc: string;
  readonly icon: string;
  readonly x: number;
  readonly y: number;
  readonly isPast: boolean;
  readonly isActive: boolean;
  readonly isFuture: boolean;
}

export interface RibbonSegmentRenderData {
  readonly pointsTop: string;
  readonly pointsBottom: string;
  readonly fillTop: string;
  readonly fillBottom: string;
  readonly stroke: string;
}

@Component({
  selector: 'kirigami-process-loader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './process-loader.html',
  styleUrl: './process-loader.scss',
})
export class ProcessLoaderComponent implements OnInit, OnDestroy {
  protected readonly i18n = inject(I18nService);

  @Input() mode: 'alternatives' | '3d' = '3d';
  @Input() modelName = '';
  @Input() pick: number | null = null;
  @Input() startedAt?: number;

  private readonly initTime = Date.now();
  private readonly now = signal<number>(Date.now());
  private timerHandle: ReturnType<typeof setInterval> | null = null;

  protected readonly elapsedSeconds = computed(() => {
    const origin = this.startedAt ?? this.initTime;
    return Math.max(0, Math.floor((this.now() - origin) / 1000));
  });

  protected readonly steps3d: readonly ProcessStep[] = [
    { id: 'crop', icon: '✂️', titleKey: 'loaderStepCrop', descKey: 'loaderStepCropDesc' },
    { id: 'gpu', icon: '⚡', titleKey: 'loaderStepGpu', descKey: 'loaderStepGpuDesc' },
    { id: 'voxel', icon: '🧊', titleKey: 'loaderStepVoxel', descKey: 'loaderStepVoxelDesc' },
    { id: 'mesh', icon: '🎨', titleKey: 'loaderStepMesh', descKey: 'loaderStepMeshDesc' },
    { id: 'finalize', icon: '✨', titleKey: 'loaderStepFinalize', descKey: 'loaderStepFinalizeDesc' },
  ];

  protected readonly stepsAlt: readonly ProcessStep[] = [
    { id: 'prompt', icon: '🧠', titleKey: 'loaderStepAltPrompt', descKey: 'loaderStepAltPromptDesc' },
    { id: 'style', icon: '🎨', titleKey: 'loaderStepAltStyle', descKey: 'loaderStepAltStyleDesc' },
    { id: 'synth', icon: '✨', titleKey: 'loaderStepAltSynth', descKey: 'loaderStepAltSynthDesc' },
    { id: 'prep', icon: '📐', titleKey: 'loaderStepAltPrep', descKey: 'loaderStepAltPrepDesc' },
  ];

  protected readonly currentSteps = computed(() => {
    return this.mode === '3d' ? this.steps3d : this.stepsAlt;
  });

  protected readonly activeStepIndex = computed(() => {
    const s = this.elapsedSeconds();
    if (this.mode === '3d') {
      if (s < 3) return 0;
      if (s < 8) return 1;
      if (s < 15) return 2;
      if (s < 21) return 3;
      return 4;
    }
    if (s < 3) return 0;
    if (s < 7) return 1;
    if (s < 13) return 2;
    return 3;
  });

  protected readonly activeStep = computed(() => {
    const steps = this.currentSteps();
    const idx = Math.min(this.activeStepIndex(), steps.length - 1);
    return steps[idx];
  });

  protected readonly progressPercent = computed(() => {
    const s = this.elapsedSeconds();
    const target = this.mode === '3d' ? 24 : 16;
    return Math.min(94, Math.round(8 + (s / target) * 84));
  });

  protected readonly formattedTime = computed(() => {
    const total = this.elapsedSeconds();
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  });

  protected readonly milestones = computed<readonly MilestoneRenderData[]>(() => {
    const steps = this.currentSteps();
    const active = this.activeStepIndex();
    const count = steps.length;
    const startX = 50;
    const endX = 470;
    const stepX = (endX - startX) / Math.max(1, count - 1);

    return steps.map((step, i) => {
      const x = Math.round(startX + i * stepX);
      const y = i % 2 === 0 ? 42 : 24;
      const isPast = i < active;
      const isActive = i === active;
      const isFuture = i > active;

      return {
        index: i,
        id: step.id,
        title: this.i18n.translate(step.titleKey),
        desc: this.i18n.translate(step.descKey),
        icon: step.icon,
        x,
        y: isActive ? y - 6 : y,
        isPast,
        isActive,
        isFuture,
      };
    });
  });

  protected readonly ribbonSegments = computed<readonly RibbonSegmentRenderData[]>(() => {
    const list = this.milestones();
    const active = this.activeStepIndex();
    const segments: RibbonSegmentRenderData[] = [];

    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i];
      const next = list[i + 1];

      const curY = cur.index % 2 === 0 ? 42 : 24;
      const nextY = next.index % 2 === 0 ? 42 : 24;

      const pTop = `${cur.x},${curY + 26} ${next.x},${nextY + 26} ${next.x},${nextY + 36} ${cur.x},${curY + 36}`;
      const pBottom = `${cur.x},${curY + 36} ${next.x},${nextY + 36} ${next.x},${nextY + 40} ${cur.x},${curY + 40}`;

      if (i < active - 1) {
        segments.push({
          pointsTop: pTop,
          pointsBottom: pBottom,
          fillTop: '#10b981',
          fillBottom: '#047857',
          stroke: 'none',
        });
      } else if (i === active - 1) {
        segments.push({
          pointsTop: pTop,
          pointsBottom: pBottom,
          fillTop: '#0ea5e9',
          fillBottom: '#0284c7',
          stroke: 'none',
        });
      } else {
        segments.push({
          pointsTop: pTop,
          pointsBottom: pBottom,
          fillTop: '#f1f5f9',
          fillBottom: '#e2e8f0',
          stroke: '#cbd5e1',
        });
      }
    }

    return segments;
  });

  protected readonly leapArc = computed<string>(() => {
    const list = this.milestones();
    const active = this.activeStepIndex();
    if (active <= 0) {
      return '';
    }
    const prev = list[active - 1];
    const cur = list[active];
    const midX = (prev.x + cur.x) / 2;
    const midY = Math.min(prev.y, cur.y) - 32;
    return `M ${prev.x} ${prev.y} Q ${midX} ${midY} ${cur.x} ${cur.y}`;
  });

  ngOnInit(): void {
    this.timerHandle = setInterval(() => {
      this.now.set(Date.now());
    }, 250);
  }

  ngOnDestroy(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
