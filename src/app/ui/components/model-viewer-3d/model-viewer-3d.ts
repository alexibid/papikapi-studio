import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import * as THREE from 'three';
import { PaperModel } from '../../../domain/models/kirigami-model';
import { FoldStep, KirigamiFoldRig } from '../../../domain/services/kirigami-fold-rig';

@Component({
  selector: 'kirigami-model-viewer-3d',
  standalone: true,
  templateUrl: './model-viewer-3d.html',
  styleUrl: './model-viewer-3d.scss',
})
export class ModelViewer3DComponent implements AfterViewInit, OnDestroy {
  readonly model = input.required<PaperModel>();

  protected readonly currentStep = signal<number>(0);
  protected readonly totalSteps = signal<number>(0);
  protected readonly isPlaying = signal<boolean>(false);
  protected readonly currentStepInfo = signal<FoldStep | null>(null);

  protected readonly boxes = computed(() => this.model().boxes);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('webglCanvas');
  private readonly containerRef = viewChild.required<ElementRef<HTMLElement>>('container');
  private readonly document = inject(DOCUMENT);

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private rig?: KirigamiFoldRig;
  private animFrameId?: number;
  private resizeObserver?: ResizeObserver;

  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private spherical = { radius: 240, theta: -Math.PI / 4, phi: Math.PI / 3 };
  private cameraTarget = new THREE.Vector3(0, 5, 0);
  private targetSphericalRadius = 240;
  private targetCameraTarget = new THREE.Vector3(0, 5, 0);

  private autoPlayTimer = 0;

  constructor() {
    effect(() => {
      const currentModel = this.model();
      if (this.scene) {
        this.rebuildRig(currentModel);
      }
    });
  }

  ngAfterViewInit(): void {
    this.initThree();
    this.rebuildRig(this.model());
    this.startLoop();
    this.setupResizeObserver();
  }

  ngOnDestroy(): void {
    if (this.animFrameId !== undefined) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.resizeObserver?.disconnect();
    this.rig?.dispose();
    this.renderer?.dispose();
  }

  protected onStepSliderChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const step = Number.parseInt(target.value, 10);
    this.setStep(step);
  }

  protected nextStep(): void {
    if (this.currentStep() < this.totalSteps()) {
      this.setStep(this.currentStep() + 1);
    }
  }

  protected previousStep(): void {
    if (this.currentStep() > 0) {
      this.setStep(this.currentStep() - 1);
    }
  }

  protected setStep(step: number): void {
    const clamped = Math.max(0, Math.min(this.totalSteps(), step));
    this.currentStep.set(clamped);
    this.currentStepInfo.set(this.rig?.getStepInfo(clamped) ?? null);
    this.rig?.applyStep(clamped, 1.0);

    const framing = this.rig?.getCameraFraming(clamped, 1.0);
    if (framing) {
      this.targetCameraTarget.copy(framing.target);
      this.targetSphericalRadius = framing.radius;
    }
  }

  protected togglePlay(): void {
    const willPlay = !this.isPlaying();
    if (willPlay && this.currentStep() >= this.totalSteps()) {
      this.setStep(0);
    }
    this.isPlaying.set(willPlay);
    this.autoPlayTimer = 0;
  }

  protected resetCamera(): void {
    this.spherical.theta = -Math.PI / 4;
    this.spherical.phi = Math.PI / 3;
    const framing = this.rig?.getCameraFraming(this.currentStep(), 1.0);
    if (framing) {
      this.targetCameraTarget.copy(framing.target);
      this.targetSphericalRadius = framing.radius;
    }
  }

  protected zoom(delta: number): void {
    this.targetSphericalRadius = Math.max(80, Math.min(500, this.targetSphericalRadius - delta * 40));
  }

  protected onPointerDown(event: PointerEvent): void {
    this.isDragging = true;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.isDragging) return;
    const dx = event.clientX - this.lastPointerX;
    const dy = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    this.spherical.theta -= dx * 0.008;
    this.spherical.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.spherical.phi - dy * 0.008));
    this.updateCameraPosition();
  }

  protected onPointerUp(): void {
    this.isDragging = false;
  }

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoom(event.deltaY > 0 ? -0.3 : 0.3);
  }

  private initThree(): void {
    const canvas = this.canvasRef().nativeElement;
    const width = canvas.clientWidth || 400;
    const height = canvas.clientHeight || 400;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 2000);
    this.camera = camera;
    this.updateCameraPosition();

    const ambientLight = new THREE.AmbientLight(0xfffdfa, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.3);
    dirLight.position.set(160, 260, 180);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 600;
    dirLight.shadow.camera.left = -160;
    dirLight.shadow.camera.right = 160;
    dirLight.shadow.camera.top = 160;
    dirLight.shadow.camera.bottom = -160;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xe4f0f8, 0.45);
    fillLight.position.set(-160, 120, -140);
    scene.add(fillLight);

    const groundGeo = new THREE.PlaneGeometry(800, 800);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.14 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -60;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  private rebuildRig(model: PaperModel): void {
    if (!this.scene) return;
    if (this.rig) {
      this.scene.remove(this.rig.root);
      this.rig.dispose();
    }
    this.rig = new KirigamiFoldRig(model);
    this.scene.add(this.rig.root);

    const total = this.rig.totalSteps;
    this.totalSteps.set(total);
    this.setStep(total);
    this.cameraTarget.copy(this.targetCameraTarget);
    this.spherical.radius = this.targetSphericalRadius;
    this.updateCameraPosition();
  }

  private updateCameraPosition(): void {
    if (!this.camera) return;
    const { radius, theta, phi } = this.spherical;
    const x = this.cameraTarget.x + radius * Math.sin(phi) * Math.sin(theta);
    const y = this.cameraTarget.y + radius * Math.cos(phi);
    const z = this.cameraTarget.z + radius * Math.sin(phi) * Math.cos(theta);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.cameraTarget);
  }

  private startLoop(): void {
    let lastTime = performance.now();

    const loop = (time: number) => {
      const delta = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      if (this.isPlaying()) {
        this.autoPlayTimer += delta;
        const stepDuration = 0.85;
        const progress = Math.min(1.0, this.autoPlayTimer / stepDuration);

        if (this.currentStep() < this.totalSteps()) {
          const nextStepNum = this.currentStep() + 1;
          this.rig?.applyStep(nextStepNum, progress);
          const framing = this.rig?.getCameraFraming(nextStepNum, progress);
          if (framing) {
            this.targetCameraTarget.copy(framing.target);
            this.targetSphericalRadius = framing.radius;
          }
          if (progress >= 1.0) {
            this.autoPlayTimer = 0;
            this.setStep(nextStepNum);
          }
        } else {
          this.isPlaying.set(false);
          this.autoPlayTimer = 0;
        }
      }

      const lerpFactor = Math.min(1.0, delta * 6.0);
      this.cameraTarget.lerp(this.targetCameraTarget, lerpFactor);
      this.spherical.radius = THREE.MathUtils.lerp(
        this.spherical.radius,
        this.targetSphericalRadius,
        lerpFactor
      );
      this.updateCameraPosition();

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  private setupResizeObserver(): void {
    const view = this.document.defaultView;
    if (!view?.ResizeObserver) return;

    this.resizeObserver = new view.ResizeObserver(() => {
      const container = this.containerRef().nativeElement;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0 || !this.renderer || !this.camera) return;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    });

    this.resizeObserver.observe(this.containerRef().nativeElement);
  }
}
