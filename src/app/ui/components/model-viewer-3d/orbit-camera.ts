import { Box3, PerspectiveCamera, Sphere, Vector3 } from 'three';

const FIT_MARGIN = 1.5;
const PITCH_LIMIT = 0.06;
const ORBIT_SENSITIVITY = 0.008;
const ZOOM_LIMITS = { min: 0.4, max: 4 } as const;
const HOME = { yaw: Math.PI * 0.28, pitch: Math.PI * 0.38 } as const;

export class OrbitCamera {
  readonly camera = new PerspectiveCamera(38, 1, 0.01, 4000);

  private readonly target = new Vector3();
  private distance = 4;
  private yaw = HOME.yaw;
  private pitch = HOME.pitch;
  private zoom = 1;

  frame(box: Box3): void {
    const sphere = box.getBoundingSphere(new Sphere());
    this.target.copy(sphere.center);
    const halfAngle = (this.camera.fov * Math.PI) / 360;
    this.distance = (sphere.radius / Math.sin(halfAngle)) * FIT_MARGIN;
    this.camera.near = Math.max(0.001, this.distance * 0.01);
    this.camera.far = this.distance * 12;
    this.apply();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.apply();
  }

  orbit(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * ORBIT_SENSITIVITY;
    this.pitch = clamp(
      this.pitch - deltaY * ORBIT_SENSITIVITY,
      PITCH_LIMIT,
      Math.PI - PITCH_LIMIT
    );
    this.apply();
  }

  scale(factor: number): void {
    this.zoom = clamp(this.zoom * factor, ZOOM_LIMITS.min, ZOOM_LIMITS.max);
    this.apply();
  }

  home(): void {
    this.yaw = HOME.yaw;
    this.pitch = HOME.pitch;
    this.zoom = 1;
    this.apply();
  }

  private apply(): void {
    const radius = this.distance / this.zoom;
    this.camera.position.set(
      this.target.x + radius * Math.sin(this.pitch) * Math.sin(this.yaw),
      this.target.y + radius * Math.cos(this.pitch),
      this.target.z + radius * Math.sin(this.pitch) * Math.cos(this.yaw)
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
