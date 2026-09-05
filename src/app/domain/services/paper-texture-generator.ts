import * as THREE from 'three';
import { BoxDecor } from '../models/kirigami-model';

export class PaperTextureGenerator {
  private static readonly TEXTURE_SIZE = 512;

  static createDecorTexture(hue: string, decor: BoxDecor): THREE.CanvasTexture | null {
    if (decor === 'none') {
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.TEXTURE_SIZE;
    canvas.height = this.TEXTURE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = hue;
    ctx.fillRect(0, 0, this.TEXTURE_SIZE, this.TEXTURE_SIZE);

    if (decor === 'face') {
      this.drawFace(ctx);
    } else if (decor === 'grin') {
      this.drawGrin(ctx);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  private static drawFace(ctx: CanvasRenderingContext2D): void {
    const s = this.TEXTURE_SIZE;

    ctx.fillStyle = '#f2f0e4';
    ctx.strokeStyle = 'rgba(45, 40, 30, 0.25)';
    ctx.lineWidth = s * 0.008;
    this.roundRect(ctx, s * 0.12, s * 0.22, s * 0.76, s * 0.42, s * 0.05);
    ctx.fill();
    ctx.stroke();

    const eyeRadius = s * 0.12;
    const leftEyeX = s * 0.33;
    const rightEyeX = s * 0.67;
    const eyeY = s * 0.42;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2f3324';
    ctx.lineWidth = s * 0.015;

    ctx.beginPath();
    ctx.arc(leftEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(rightEyeX, eyeY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const pupilRadius = s * 0.06;
    ctx.fillStyle = '#23261c';

    ctx.beginPath();
    ctx.arc(leftEyeX + s * 0.02, eyeY + s * 0.02, pupilRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(rightEyeX + s * 0.02, eyeY + s * 0.02, pupilRadius, 0, Math.PI * 2);
    ctx.fill();

    const highlightRadius = s * 0.022;
    ctx.fillStyle = '#ffffff';

    ctx.beginPath();
    ctx.arc(leftEyeX + s * 0.038, eyeY - s * 0.01, highlightRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(rightEyeX + s * 0.038, eyeY - s * 0.01, highlightRadius, 0, Math.PI * 2);
    ctx.fill();

    const nostrilRadius = s * 0.038;
    ctx.fillStyle = '#23261c';

    ctx.beginPath();
    ctx.arc(s * 0.38, s * 0.82, nostrilRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(s * 0.62, s * 0.82, nostrilRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  private static drawGrin(ctx: CanvasRenderingContext2D): void {
    const s = this.TEXTURE_SIZE;
    const toothCount = 8;
    const startX = s * 0.06;
    const totalW = s * 0.88;
    const toothW = totalW / toothCount;
    const topY = s * 0.08;
    const bottomY = s * 0.88;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#2f3324';
    ctx.lineWidth = s * 0.018;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(startX, topY);

    for (let i = 0; i < toothCount; i++) {
      const midX = startX + i * toothW + toothW / 2;
      const nextX = startX + (i + 1) * toothW;
      ctx.lineTo(midX, bottomY);
      ctx.lineTo(nextX, topY);
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private static roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
