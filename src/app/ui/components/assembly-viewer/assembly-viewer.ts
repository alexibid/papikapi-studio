import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { I18nService } from '@ibid/services';
import { ButtonComponent, SliderComponent } from 'ibid-ui';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  HemisphereLight,
  Scene,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssemblyPlanService } from '../../../application/services/assembly-plan.service';
import { OrbitCamera } from '../model-viewer-3d/orbit-camera';
import { AssemblyRig } from './assembly-rig';
import { FinalModel } from './final-model';

const MAX_PIXEL_RATIO = 2;
const STEP_MS = 3600;
const PERCENT = 100;

@Component({
  selector: 'papikapi-studio-assembly-viewer',
  standalone: true,
  imports: [ButtonComponent, SliderComponent],
  templateUrl: './assembly-viewer.html',
  styleUrl: './assembly-viewer.scss',
})
export class AssemblyViewerComponent implements AfterViewInit, OnDestroy {
  readonly source = input.required<string>();
  readonly modelSource = input<string>('');
  readonly progress = model<number>(0);

  protected readonly i18n = inject(I18nService);
  protected readonly problem = signal<string>('');
  protected readonly playing = signal<boolean>(false);
  protected readonly percent = computed(() => Math.round(this.progress() * PERCENT * 10) / 10);

  private readonly plans = inject(AssemblyPlanService);
  private readonly document = inject(DOCUMENT);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('webglCanvas');
  private readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');

  private readonly scene = new Scene();
  private readonly camera = new OrbitCamera();
  private renderer?: WebGLRenderer;
  private rig?: AssemblyRig;
  private finalModel?: FinalModel;
  private playbackMs = STEP_MS;
  private resizeObserver?: ResizeObserver;
  private frameId?: number;
  private playbackId?: number;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  constructor() {
    effect(() => {
      const url = this.source();
      if (this.renderer) {
        void this.load(url);
      }
    });
    effect(() => {
      const progress = this.progress();
      const isComplete = progress >= 1;
      if (this.finalModel && this.rig) {
        this.finalModel.show(isComplete);
        this.rig.root.visible = !isComplete;
      }
      this.rig?.update(progress);
      this.followShot(progress);
      this.draw();
    });
  }

  ngAfterViewInit(): void {
    this.buildScene();
    this.observeResize();
    void this.load(this.source());
  }

  ngOnDestroy(): void {
    this.stopPlayback();
    if (this.frameId !== undefined) {
      cancelAnimationFrame(this.frameId);
    }
    this.resizeObserver?.disconnect();
    this.discardRig();
    this.renderer?.dispose();
  }

  protected seek(percent: number): void {
    this.stopPlayback();
    this.progress.set(percent / PERCENT);
  }

  protected togglePlayback(): void {
    if (this.playing()) {
      this.stopPlayback();
      return;
    }
    const resumeFrom = this.progress() >= 1 ? 0 : this.progress();
    const startedAt = performance.now() - resumeFrom * this.playbackMs;
    this.playing.set(true);
    this.advance(startedAt);
  }

  protected resetView(): void {
    this.camera.home();
    this.draw();
  }

  protected onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    this.camera.orbit(event.clientX - this.lastPointer.x, event.clientY - this.lastPointer.y);
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.draw();
  }

  protected onPointerUp(): void {
    this.dragging = false;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.camera.scale(event.deltaY > 0 ? 0.9 : 1.1);
    this.draw();
  }

  private advance(startedAt: number): void {
    const next = (performance.now() - startedAt) / this.playbackMs;
    this.progress.set(Math.min(1, next));
    if (next >= 1) {
      this.stopPlayback();
      return;
    }
    this.playbackId = requestAnimationFrame(() => this.advance(startedAt));
  }

  private stopPlayback(): void {
    if (this.playbackId !== undefined) {
      cancelAnimationFrame(this.playbackId);
      this.playbackId = undefined;
    }
    this.playing.set(false);
  }

  private async load(url: string): Promise<void> {
    this.discardRig();
    this.problem.set('');
    if (!url) {
      return;
    }
    try {
      const rig = new AssemblyRig(await this.plans.load(url));
      this.camera.frame(rig.extent());
      this.playbackMs = STEP_MS * rig.stepCount;
      rig.update(this.progress());
      this.scene.add(rig.root);
      this.rig = rig;
      const glbUrl = this.modelSource() || url.replace(/assembly\.json(\?.*)?$/, 'model.glb$1');
      void this.loadFinalModel(rig, glbUrl);
      this.followShot(this.progress());
      this.fitViewport();
    } catch {
      this.problem.set(this.i18n.translate('assemblyLoadFailed'));
    }
  }

  private async loadFinalModel(rig: AssemblyRig, glbUrl: string): Promise<void> {
    if (!glbUrl) {
      return;
    }
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(glbUrl);
      if (this.rig !== rig) {
        return;
      }
      const finalModel = new FinalModel(gltf.scene);
      finalModel.alignTo(rig.figureShot());
      const isComplete = this.progress() >= 1;
      finalModel.show(isComplete);
      if (isComplete) {
        rig.root.visible = false;
      }
      this.scene.add(finalModel.root);
      this.finalModel = finalModel;
      this.draw();
    } catch {
      // Non-fatal fallback if GLB is unavailable
    }
  }

  private followShot(progress: number): void {
    if (this.rig) {
      const shot = this.rig.shot(progress);
      this.camera.frameSphere(shot);
      this.camera.settle(this.rig.finaleWeight(progress));
    }
  }

  private discardRig(): void {
    if (this.finalModel) {
      this.scene.remove(this.finalModel.root);
      this.finalModel.dispose();
      this.finalModel = undefined;
    }
    if (this.rig) {
      this.scene.remove(this.rig.root);
      this.rig.dispose();
      this.rig = undefined;
    }
  }

  private buildScene(): void {
    const renderer = new WebGLRenderer({
      canvas: this.canvasRef().nativeElement,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    this.renderer = renderer;

    const key = new DirectionalLight(0xfffdfa, 2.2);
    key.position.set(3.5, 5.5, 4);

    const fill = new DirectionalLight(0xe8f0ff, 1.5);
    fill.position.set(-3.5, 3.5, 3.5);

    const front = new DirectionalLight(0xffffff, 0.9);
    front.position.set(0, 1.5, 5);

    const rim = new DirectionalLight(0xdbe8ff, 1.3);
    rim.position.set(-3.5, 3.5, -4.5);

    const backRim = new DirectionalLight(0xffeedd, 0.8);
    backRim.position.set(3.5, 2.5, -4);

    const bounce = new DirectionalLight(0xffeedd, 0.7);
    bounce.position.set(0, -4, 2);

    this.scene.add(
      new HemisphereLight(0xfff8ee, 0xa0acbc, 2.4),
      new AmbientLight(0xffffff, 0.8),
      key,
      fill,
      front,
      rim,
      backRim,
      bounce,
    );
  }

  private fitViewport(): void {
    const container = this.containerRef().nativeElement;
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    this.renderer?.setSize(width, height, false);
    this.camera.resize(width / height);
    this.draw();
  }

  private observeResize(): void {
    const view = this.document.defaultView;
    if (!view?.ResizeObserver) {
      return;
    }
    this.resizeObserver = new view.ResizeObserver(() => this.fitViewport());
    this.resizeObserver.observe(this.containerRef().nativeElement);
  }

  private draw(): void {
    if (this.frameId !== undefined) {
      cancelAnimationFrame(this.frameId);
    }
    this.frameId = requestAnimationFrame(() => {
      this.renderer?.render(this.scene, this.camera.camera);
    });
  }
}
