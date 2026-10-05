import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { I18nService } from '@ibid/services';
import { FlipTextComponent, FoldedTextComponent } from 'ibid-ui';
import {
  CreationProgress,
  CreationProgressService,
} from '../../../application/services/creation-progress.service';
import { LoaderProgress } from './loader-progress';
import { EXPECTED_SECONDS, ProcessLoaderMode } from './process-loader.config';
import { ReceiptStages } from './receipt-stages';

interface ReceivedProgress {
  readonly progress: CreationProgress;
  readonly stepStartedAt: number;
}

const TICK_MILLISECONDS = 500;

@Component({
  selector: 'papikapi-studio-process-loader',
  standalone: true,
  imports: [FlipTextComponent, FoldedTextComponent],
  templateUrl: './process-loader.html',
  styleUrl: './process-loader.scss',
})
export class ProcessLoaderComponent {
  protected readonly i18n = inject(I18nService);
  private readonly progressService = inject(CreationProgressService);
  private readonly mountedAt = Date.now();
  private readonly now = signal(Date.now());
  private readonly received = signal<ReceivedProgress | null>(null);

  readonly mode = input<ProcessLoaderMode>('3d');
  readonly modelName = input('');
  readonly pick = input<number | null>(null);
  readonly startedAt = input<number>();

  private readonly origin = computed(() => this.startedAt() ?? this.mountedAt);

  protected readonly percentLabel = computed(() => {
    const latest = this.received();
    if (!latest) {
      const elapsed = this.secondsSince(this.origin());
      return LoaderProgress.format(
        LoaderProgress.percentAt(elapsed, EXPECTED_SECONDS[this.mode()]),
      );
    }
    if (latest.progress.state === 'done') {
      return LoaderProgress.format(100);
    }
    const elapsedSeconds = this.secondsSince(latest.stepStartedAt);
    return LoaderProgress.format(
      LoaderProgress.percentAcrossSteps({ ...latest.progress, elapsedSeconds }),
    );
  });

  protected readonly stages = computed(() => {
    const latest = this.received();
    return latest
      ? ReceiptStages.fromProgress(latest.progress)
      : ReceiptStages.fromTimeline(this.mode(), this.secondsSince(this.origin()));
  });

  protected readonly detail = computed(() => {
    const totalSeconds = Math.floor(this.secondsSince(this.origin()));
    const clock = `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
    const pickLabel = this.pick() ? `#${this.pick()}` : '';
    return [clock, this.modelName(), pickLabel].filter((part) => part.length > 0).join(' · ');
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), TICK_MILLISECONDS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    effect((onCleanup) => {
      const disconnect = this.progressService.connect(this.modelName(), (progress) =>
        this.received.set({ progress, stepStartedAt: Date.now() - progress.elapsedInStepMs }),
      );
      onCleanup(disconnect);
    });
  }

  private secondsSince(timestamp: number): number {
    return Math.max(0, this.now() - timestamp) / 1000;
  }
}
