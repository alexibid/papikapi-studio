import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { I18nService } from '@ibid/services';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

const DEFAULT_SHEET = '/assets/pieces/tyrannosaurus-sheet.svg';
const FIT_MARGIN = 1.06;
const CURVE_SEGMENTS = 14;
const LAYER_GAP = 0.01;
const FACE_ON = { theta: 0, phi: Math.PI / 2 };
const ZOOM_LIMITS = { min: 0.35, max: 6 };

interface FillStyle {
  readonly fill?: string;
  readonly opacity: number;
}

function fillStyleOf(userData: Record<string, unknown> | undefined): FillStyle {
  const style = userData?.['style'];
  if (typeof style !== 'object' || style === null) {
    return { opacity: 1 };
  }
  const entries = style as Record<string, unknown>;
  const fill = entries['fill'];
  const opacity = entries['fillOpacity'];
  return {
    fill: typeof fill === 'string' ? fill : undefined,
    opacity: typeof opacity === 'number' ? opacity : 1,
  };
}

@Component({
  selector: 'kirigami-model-viewer-3d',
  standalone: true,
  templateUrl: './model-viewer-3d.html',
  styleUrl: './model-viewer-3d.scss',
})
export class ModelViewer3DComponent implements AfterViewInit, OnDestroy {
  readonly sheet = input<string>(DEFAULT_SHEET);

  protected readonly meshCount = signal<number>(0);
  protected readonly triangleCount = signal<number>(0);
  protected readonly problem = signal<string | null>(null);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('webglCanvas');
  private readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');
  protected readonly i18n = inject(I18nService);
  private readonly document = inject(DOCUMENT);

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.OrthographicCamera;
  private root?: THREE.Group;
  private resizeObserver?: ResizeObserver;
  private frameId?: number;

  private readonly target = new THREE.Vector3();
  private radius = 1000;
  private theta = FACE_ON.theta;
  private phi = FACE_ON.phi;
  private zoomLevel = 1;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  ngAfterViewInit(): void {
    this.initThree();
    this.loadSheet();
    this.observeResize();
  }

  ngOnDestroy(): void {
    if (this.frameId !== undefined) {
      cancelAnimationFrame(this.frameId);
    }
    this.resizeObserver?.disconnect();
    this.root?.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        (node.material as THREE.Material).dispose();
      }
    });
    this.renderer?.dispose();
  }

  private initThree(): void {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvasRef().nativeElement,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);

    this.root = new THREE.Group();
    this.root.scale.y = -1;
    this.scene.add(this.root);
  }

  private loadSheet(): void {
    new SVGLoader().load(
      this.sheet(),
      (data) => {
        let depth = 0;
        let meshes = 0;
        let triangles = 0;

        for (const path of data.paths) {
          const style = fillStyleOf(path.userData);
          depth += LAYER_GAP;
          if (!style.fill || style.fill === 'none') {
            continue;
          }
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color().setStyle(style.fill),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: style.opacity,
            depthWrite: false,
          });

          for (const shape of SVGLoader.createShapes(path)) {
            const geometry = new THREE.ShapeGeometry(shape, CURVE_SEGMENTS);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.z = depth;
            mesh.renderOrder = meshes;
            this.root?.add(mesh);
            meshes += 1;
            triangles += (geometry.index?.count ?? geometry.attributes['position'].count) / 3;
          }
        }

        this.meshCount.set(meshes);
        this.triangleCount.set(Math.round(triangles));
        this.fitCamera();
        this.renderFrame();
      },
      undefined,
      () => this.problem.set(this.i18n.translate('sheetLoadFailed'))
    );
  }

  protected zoom(delta: number): void {
    const next = this.zoomLevel * (1 + delta);
    this.zoomLevel = Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, next));
    this.applyCamera();
  }

  protected resetView(): void {
    this.theta = FACE_ON.theta;
    this.phi = FACE_ON.phi;
    this.zoomLevel = 1;
    this.applyCamera();
  }

  protected onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    this.theta -= (event.clientX - this.lastX) * 0.008;
    this.phi = Math.max(0.08, Math.min(Math.PI - 0.08, this.phi - (event.clientY - this.lastY) * 0.008));
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.applyCamera();
  }

  protected onPointerUp(): void {
    this.dragging = false;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoom(event.deltaY > 0 ? -0.12 : 0.12);
  }

  private applyCamera(): void {
    if (!this.camera) {
      return;
    }
    this.camera.zoom = this.zoomLevel;
    this.camera.position.set(
      this.target.x + this.radius * Math.sin(this.phi) * Math.sin(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * Math.sin(this.phi) * Math.cos(this.theta)
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.renderFrame();
  }

  private fitCamera(): void {
    const container = this.containerRef().nativeElement;
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    this.renderer?.setSize(width, height, false);

    if (!this.camera || !this.root || this.root.children.length === 0) {
      return;
    }

    const box = new THREE.Box3().setFromObject(this.root);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const aspect = width / height;
    const halfHeight = (size.x / size.y > aspect ? size.x / aspect : size.y) * 0.5 * FIT_MARGIN;

    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.target.copy(centre);
    this.radius = Math.max(size.x, size.y) * 2;
    this.applyCamera();
  }

  private observeResize(): void {
    const view = this.document.defaultView;
    if (!view?.ResizeObserver) {
      return;
    }
    this.resizeObserver = new view.ResizeObserver(() => {
      this.fitCamera();
      this.renderFrame();
    });
    this.resizeObserver.observe(this.containerRef().nativeElement);
  }

  private renderFrame(): void {
    if (this.frameId !== undefined) {
      cancelAnimationFrame(this.frameId);
    }
    this.frameId = requestAnimationFrame(() => {
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    });
  }
}
