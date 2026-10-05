import type {
  Mat3,
  PlacedPose,
  Pose,
  Quaternion,
  Vec2,
  Vec3,
} from './interfaces/assembly.interface.js';

export class VectorMath {
  public static add(a: Vec3, b: Vec3): Vec3 {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  public static subtract(a: Vec3, b: Vec3): Vec3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  public static scale(a: Vec3, factor: number): Vec3 {
    return [a[0] * factor, a[1] * factor, a[2] * factor];
  }

  public static dot(a: Vec3, b: Vec3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  public static cross(a: Vec3, b: Vec3): Vec3 {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  public static length(a: Vec3): number {
    return Math.sqrt(this.dot(a, a));
  }

  public static normalize(a: Vec3): Vec3 {
    return this.scale(a, 1 / this.length(a));
  }

  public static centroid(points: readonly Vec3[]): Vec3 {
    const sum = points.reduce((total, point) => this.add(total, point), [0, 0, 0] as Vec3);
    return this.scale(sum, 1 / points.length);
  }

  public static lift(point: Vec2): Vec3 {
    return [point[0], point[1], 0];
  }

  public static newellNormal(points: readonly Vec3[]): Vec3 {
    let normal: Vec3 = [0, 0, 0];
    points.forEach((current, index) => {
      const next = points[(index + 1) % points.length];
      normal = this.add(normal, this.cross(current, next));
    });
    return this.normalize(normal);
  }

  public static signedArea(polygon: readonly Vec2[]): number {
    return (
      polygon.reduce((sum, current, index) => {
        const next = polygon[(index + 1) % polygon.length];
        return sum + current[0] * next[1] - next[0] * current[1];
      }, 0) / 2
    );
  }

  public static fromColumns(x: Vec3, y: Vec3, z: Vec3): Mat3 {
    return [
      [x[0], y[0], z[0]],
      [x[1], y[1], z[1]],
      [x[2], y[2], z[2]],
    ];
  }

  public static transpose(m: Mat3): Mat3 {
    return this.fromColumns(m[0], m[1], m[2]);
  }

  public static rotate(m: Mat3, v: Vec3): Vec3 {
    return [this.dot(m[0], v), this.dot(m[1], v), this.dot(m[2], v)];
  }

  public static multiply(a: Mat3, b: Mat3): Mat3 {
    const columns = this.transpose(b);
    return this.fromColumns(
      this.rotate(a, columns[0]),
      this.rotate(a, columns[1]),
      this.rotate(a, columns[2]),
    );
  }

  public static apply(pose: Pose, point: Vec3): Vec3 {
    return this.add(this.rotate(pose.rotation, point), pose.translation);
  }

  public static inverse(pose: Pose): Pose {
    const rotation = this.transpose(pose.rotation);
    return { rotation, translation: this.scale(this.rotate(rotation, pose.translation), -1) };
  }

  public static compose(outer: Pose, inner: Pose): Pose {
    return {
      rotation: this.multiply(outer.rotation, inner.rotation),
      translation: this.apply(outer, inner.translation),
    };
  }

  public static placed(pose: Pose): PlacedPose {
    return { position: pose.translation, quaternion: this.quaternion(pose.rotation) };
  }

  public static quaternion(m: Mat3): Quaternion {
    const trace = m[0][0] + m[1][1] + m[2][2];
    if (trace > 0) {
      const s = 2 * Math.sqrt(trace + 1);
      return [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
    }
    const axis = [m[0][0], m[1][1], m[2][2]].indexOf(Math.max(m[0][0], m[1][1], m[2][2]));
    const i = axis;
    const j = (axis + 1) % 3;
    const k = (axis + 2) % 3;
    const s = 2 * Math.sqrt(m[i][i] - m[j][j] - m[k][k] + 1);
    const q = [0, 0, 0, (m[k][j] - m[j][k]) / s];
    q[i] = s / 4;
    q[j] = (m[j][i] + m[i][j]) / s;
    q[k] = (m[k][i] + m[i][k]) / s;
    return [q[0], q[1], q[2], q[3]];
  }
}
