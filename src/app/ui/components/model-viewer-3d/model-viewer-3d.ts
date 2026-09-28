import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { I18nService } from '@ibid/services';
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  Material,
  Scene,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitCamera } from './orbit-camera';

const MAX_PIXEL_RATIO = 2;

@Component({
  selector: 'papikapi-studio-model-viewer-3d',
  standalone: true,
  templateUrl: './model-viewer-3d.html',
  styleUrl: './model-viewer-3d.scss',
})
export class ModelViewer3DComponent implements AfterViewInit, OnDestroy {
  readonly source = input.required<string>();

  protected readonly partCount = signal<number>(0);
  protected readonly triangleCount = signal<number>(0);
  protected readonly problem = signal<string>('');
  protected readonly i18n = inject(I18nService);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('webglCanvas');
  private readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');
  private readonly document = inject(DOCUMENT);

  private readonly scene = new Scene();
  private readonly rig = new OrbitCamera();
  private readonly stage = new Group();
  private renderer?: WebGLRenderer;
  private resizeObserver?: ResizeObserver;
  private frameId?: number;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };

  constructor() {
    effect(() => {
      const url = this.source();
      if (this.renderer) {
        this.loadModel(url);
      }
    });
  }

  ngAfterViewInit(): void {
    this.buildScene();
    this.observeResize();
    this.loadModel(this.source());
  }

  ngOnDestroy(): void {
    if (this.frameId !== undefined) {
      cancelAnimationFrame(this.frameId);
    }
    this.resizeObserver?.disconnect();
    this.clearStage();
    this.renderer?.dispose();
  }

  protected zoom(factor: number): void {
    this.rig.scale(factor);
    this.draw();
  }

  protected resetView(): void {
    this.rig.home();
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
    this.rig.orbit(event.clientX - this.lastPointer.x, event.clientY - this.lastPointer.y);
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.draw();
  }

  protected onPointerUp(): void {
    this.dragging = false;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoom(event.deltaY > 0 ? 0.9 : 1.1);
  }

  private buildScene(): void {
    const renderer = new WebGLRenderer({
      canvas: this.canvasRef().nativeElement,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer = renderer;

    this.scene.add(new HemisphereLight(0xfff6e5, 0x8f8f8f, 2.1));
    this.scene.add(new AmbientLight(0xffffff, 0.5));
    const key = new DirectionalLight(0xffffff, 1.9);
    key.position.set(3, 6, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0xdfe7f5, 0.9);
    rim.position.set(-4, 2, -5);
    this.scene.add(rim);
    this.scene.add(this.stage);
  }

  private loadModel(url: string): void {
    this.clearStage();
    this.problem.set('');
    if (!url) {
      this.partCount.set(0);
      this.triangleCount.set(0);
      return;
    }
    new GLTFLoader().load(
      url,
      (gltf) => this.adopt(gltf.scene),
      undefined,
      () => this.problem.set(this.i18n.translate('modelLoadFailed'))
    );
  }

  private adopt(model: Group): void {
    this.stage.add(model);
    let parts = 0;
    let triangles = 0;
    model.traverse((node) => {
      if (!(node instanceof Mesh)) {
        return;
      }
      parts += 1;
      const position = node.geometry.getAttribute('position');
      triangles += (node.geometry.index?.count ?? position.count) / 3;
    });
    this.partCount.set(parts);
    this.triangleCount.set(Math.round(triangles));
    this.rig.frame(new Box3().setFromObject(this.stage));
    this.fitViewport();
  }

  private clearStage(): void {
    for (const child of [...this.stage.children]) {
      child.traverse((node) => {
        if (node instanceof Mesh) {
          node.geometry.dispose();
          materialsOf(node).forEach((material) => material.dispose());
        }
      });
      this.stage.remove(child);
    }
  }

  private fitViewport(): void {
    const container = this.containerRef().nativeElement;
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    this.renderer?.setSize(width, height, false);
    this.rig.resize(width / height);
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
      this.renderer?.render(this.scene, this.rig.camera);
    });
  }
}

function materialsOf(mesh: Mesh): readonly Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}
