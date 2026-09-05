import * as THREE from 'three';
import { ModelBox, ModelSpike, PaperModel } from '../models/kirigami-model';
import { PaperTextureGenerator } from './paper-texture-generator';

export type FoldActionType =
  | 'fold-top'
  | 'fold-bottom'
  | 'fold-left'
  | 'fold-right'
  | 'fold-back'
  | 'dock-box'
  | 'dock-spikes';

export interface FoldStep {
  readonly stepNumber: number;
  readonly type: FoldActionType;
  readonly partId: string;
  readonly title: string;
  readonly description: string;
}

export interface CameraFraming {
  readonly target: THREE.Vector3;
  readonly radius: number;
}

interface BoxRigNode {
  readonly id: string;
  readonly group: THREE.Group;
  readonly topPivot: THREE.Group;
  readonly bottomPivot: THREE.Group;
  readonly leftPivot: THREE.Group;
  readonly rightPivot: THREE.Group;
  readonly backPivot: THREE.Group;
  readonly centerPosition: THREE.Vector3;
  readonly centerQuaternion: THREE.Quaternion;
  readonly targetPosition: THREE.Vector3;
  readonly targetQuaternion: THREE.Quaternion;
  readonly stepIndices: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    back: number;
    dock: number;
  };
}

interface SpikeRigNode {
  readonly group: THREE.Group;
  readonly centerPosition: THREE.Vector3;
  readonly centerQuaternion: THREE.Quaternion;
  readonly targetPosition: THREE.Vector3;
  readonly targetQuaternion: THREE.Quaternion;
}

export class KirigamiFoldRig {
  readonly root = new THREE.Group();
  readonly steps: readonly FoldStep[];

  private readonly boxNodes: BoxRigNode[] = [];
  private readonly spikeNodes: SpikeRigNode[] = [];
  private readonly disposables: { dispose(): void }[] = [];
  private spikesDockStepIndex = -1;

  constructor(model: PaperModel) {
    const stepsList: FoldStep[] = [];
    this.buildRig(model, stepsList);
    this.steps = stepsList;
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  getStepInfo(stepIndex: number): FoldStep | null {
    if (stepIndex <= 0 || stepIndex > this.steps.length) return null;
    return this.steps[stepIndex - 1];
  }

  applyStep(stepIndex: number, transitionProgress = 1.0): void {
    const currentActiveStep = Math.max(0, Math.min(this.steps.length, stepIndex));
    const subProgress = Math.max(0, Math.min(1, transitionProgress));

    const getProgressForStep = (idx: number): number => {
      if (idx < currentActiveStep) return 1.0;
      if (idx === currentActiveStep) return subProgress;
      return 0.0;
    };

    const activeBoxNode = this.boxNodes.find(
      (n) => currentActiveStep >= n.stepIndices.top && currentActiveStep <= n.stepIndices.dock
    );

    let figureOffsetZ = 0;
    if (activeBoxNode) {
      if (currentActiveStep < activeBoxNode.stepIndices.dock) {
        figureOffsetZ = -110;
      } else {
        const dockProg = getProgressForStep(activeBoxNode.stepIndices.dock);
        const dockEase = this.smoothstep(dockProg);
        figureOffsetZ = -110 * (1 - dockEase);
      }
    }

    for (let i = 0; i < this.boxNodes.length; i++) {
      const node = this.boxNodes[i];
      const { top, bottom, left, right, back, dock } = node.stepIndices;

      if (currentActiveStep < top) {
        if (currentActiveStep === 0 && i === 0) {
          node.group.visible = true;
          node.group.position.copy(node.centerPosition);
          node.group.quaternion.copy(node.centerQuaternion);
          node.topPivot.rotation.x = 0;
          node.bottomPivot.rotation.x = 0;
          node.leftPivot.rotation.y = 0;
          node.rightPivot.rotation.y = 0;
          node.backPivot.rotation.y = 0;
        } else {
          node.group.visible = false;
        }
        continue;
      }

      node.group.visible = true;

      const topProg = getProgressForStep(top);
      const bottomProg = getProgressForStep(bottom);
      const leftProg = getProgressForStep(left);
      const rightProg = getProgressForStep(right);
      const backProg = getProgressForStep(back);
      const dockProg = getProgressForStep(dock);

      node.topPivot.rotation.x = -topProg * (Math.PI / 2);
      node.bottomPivot.rotation.x = bottomProg * (Math.PI / 2);
      node.leftPivot.rotation.y = -leftProg * (Math.PI / 2);
      node.rightPivot.rotation.y = rightProg * (Math.PI / 2);
      node.backPivot.rotation.y = backProg * (Math.PI / 2);

      if (currentActiveStep < dock) {
        node.group.position.copy(node.centerPosition);
        node.group.quaternion.copy(node.centerQuaternion);
      } else if (currentActiveStep === dock) {
        const dockEase = this.smoothstep(dockProg);
        node.group.position.lerpVectors(node.centerPosition, node.targetPosition, dockEase);
        node.group.quaternion.slerpQuaternions(node.centerQuaternion, node.targetQuaternion, dockEase);
      } else {
        node.group.position.set(
          node.targetPosition.x,
          node.targetPosition.y,
          node.targetPosition.z + figureOffsetZ
        );
        node.group.quaternion.copy(node.targetQuaternion);
      }
    }

    if (this.spikesDockStepIndex !== -1) {
      const spikesProg = getProgressForStep(this.spikesDockStepIndex);
      const spikesEase = this.smoothstep(spikesProg);

      for (const node of this.spikeNodes) {
        if (currentActiveStep < this.spikesDockStepIndex) {
          node.group.visible = false;
        } else if (currentActiveStep === this.spikesDockStepIndex) {
          node.group.visible = true;
          node.group.position.lerpVectors(node.centerPosition, node.targetPosition, spikesEase);
          node.group.quaternion.slerpQuaternions(node.centerQuaternion, node.targetQuaternion, spikesEase);
        } else {
          node.group.visible = true;
          node.group.position.copy(node.targetPosition);
          node.group.quaternion.copy(node.targetQuaternion);
        }
      }
    }
  }

  getCameraFraming(stepIndex: number, transitionProgress = 1.0): CameraFraming {
    const currentActiveStep = Math.max(0, Math.min(this.steps.length, stepIndex));
    const subProgress = Math.max(0, Math.min(1, transitionProgress));

    if (currentActiveStep === 0) {
      return {
        target: new THREE.Vector3(0, 0, 0),
        radius: 175,
      };
    }

    if (currentActiveStep >= this.steps.length) {
      return {
        target: new THREE.Vector3(0, 5, 0),
        radius: 240,
      };
    }

    const step = this.steps[currentActiveStep - 1];
    if (!step) {
      return {
        target: new THREE.Vector3(0, 5, 0),
        radius: 240,
      };
    }

    if (step.type === 'dock-box') {
      const node = this.boxNodes.find((n) => n.id === step.partId);
      if (node) {
        const ease = this.smoothstep(subProgress);
        const target = new THREE.Vector3().lerpVectors(
          node.centerPosition,
          node.targetPosition,
          ease
        );
        const radius = THREE.MathUtils.lerp(175, 210, ease);
        return { target, radius };
      }
    }

    if (step.type === 'dock-spikes') {
      const ease = this.smoothstep(subProgress);
      const target = new THREE.Vector3(0, 10 * ease, 0);
      const radius = THREE.MathUtils.lerp(180, 230, ease);
      return { target, radius };
    }

    return {
      target: new THREE.Vector3(0, 0, 0),
      radius: 170,
    };
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.boxNodes.length = 0;
    this.spikeNodes.length = 0;
  }

  private buildRig(model: PaperModel, stepsList: FoldStep[]): void {
    const boxes = model.boxes;
    let stepCounter = 1;

    boxes.forEach((box) => {
      const topStep = stepCounter++;
      stepsList.push({
        stepNumber: topStep,
        type: 'fold-top',
        partId: box.id,
        title: `${box.id} — Face Superior`,
        description: `Dobra a face superior de ${box.id} a 90°`,
      });

      const bottomStep = stepCounter++;
      stepsList.push({
        stepNumber: bottomStep,
        type: 'fold-bottom',
        partId: box.id,
        title: `${box.id} — Face Inferior`,
        description: `Dobra a face inferior de ${box.id} a 90°`,
      });

      const leftStep = stepCounter++;
      stepsList.push({
        stepNumber: leftStep,
        type: 'fold-left',
        partId: box.id,
        title: `${box.id} — Lateral Esquerda`,
        description: `Dobra a lateral esquerda de ${box.id} a 90°`,
      });

      const rightStep = stepCounter++;
      stepsList.push({
        stepNumber: rightStep,
        type: 'fold-right',
        partId: box.id,
        title: `${box.id} — Lateral Direita`,
        description: `Dobra a lateral direita de ${box.id} a 90°`,
      });

      const backStep = stepCounter++;
      stepsList.push({
        stepNumber: backStep,
        type: 'fold-back',
        partId: box.id,
        title: `${box.id} — Fechar Caixa`,
        description: `Dobra a face traseira e fecha a caixa ${box.id}`,
      });

      const dockStep = stepCounter++;
      stepsList.push({
        stepNumber: dockStep,
        type: 'dock-box',
        partId: box.id,
        title: `${box.id} — Encaixe`,
        description: `Posiciona e cola a peça ${box.id} no boneco`,
      });

      const node = this.createBoxNode(box, {
        top: topStep,
        bottom: bottomStep,
        left: leftStep,
        right: rightStep,
        back: backStep,
        dock: dockStep,
      });

      this.boxNodes.push(node);
      this.root.add(node.group);
    });

    const spikes = model.spikes ?? [];
    if (spikes.length > 0) {
      const spikesStep = stepCounter++;
      this.spikesDockStepIndex = spikesStep;
      stepsList.push({
        stepNumber: spikesStep,
        type: 'dock-spikes',
        partId: 'crests',
        title: 'Cristas Dorsais — Encaixe',
        description: 'Cola e fixa as cristas dorsais na espinha do modelo',
      });

      spikes.forEach((spike) => {
        const node = this.createSpikeNode(spike);
        this.spikeNodes.push(node);
        this.root.add(node.group);
      });
    }
  }

  private createBoxNode(
    box: ModelBox,
    stepIndices: { top: number; bottom: number; left: number; right: number; back: number; dock: number }
  ): BoxRigNode {
    const w = box.width;
    const h = box.height;
    const d = box.depth;

    const group = new THREE.Group();

    const centerPosition = new THREE.Vector3(0, 0, 0);
    const centerQuaternion = new THREE.Quaternion();

    const targetPosition = new THREE.Vector3(box.x, -box.y, box.z);
    const targetQuaternion = new THREE.Quaternion();

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: box.hue,
      roughness: 0.85,
      metalness: 0.04,
      side: THREE.DoubleSide,
    });
    this.disposables.push(baseMaterial);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x24201a,
      transparent: true,
      opacity: 0.35,
    });
    this.disposables.push(edgeMaterial);

    const decorTexture = PaperTextureGenerator.createDecorTexture(box.hue, box.decor);
    if (decorTexture) {
      this.disposables.push(decorTexture);
    }

    const frontMaterial = decorTexture
      ? new THREE.MeshStandardMaterial({
          map: decorTexture,
          roughness: 0.85,
          metalness: 0.04,
          side: THREE.DoubleSide,
        })
      : baseMaterial;
    if (frontMaterial !== baseMaterial) {
      this.disposables.push(frontMaterial);
    }

    const frontGeo = new THREE.PlaneGeometry(w, h);
    this.disposables.push(frontGeo);
    const frontMesh = new THREE.Mesh(frontGeo, frontMaterial);
    frontMesh.castShadow = true;
    frontMesh.receiveShadow = true;
    this.addEdgeLines(frontMesh, frontGeo, edgeMaterial);
    group.add(frontMesh);

    const topPivot = new THREE.Group();
    topPivot.position.set(0, h / 2, 0);
    const topGeo = new THREE.PlaneGeometry(w, d);
    this.disposables.push(topGeo);
    const topMesh = new THREE.Mesh(topGeo, baseMaterial);
    topMesh.position.set(0, d / 2, 0);
    topMesh.castShadow = true;
    this.addEdgeLines(topMesh, topGeo, edgeMaterial);
    topPivot.add(topMesh);
    group.add(topPivot);

    const bottomPivot = new THREE.Group();
    bottomPivot.position.set(0, -h / 2, 0);
    const bottomGeo = new THREE.PlaneGeometry(w, d);
    this.disposables.push(bottomGeo);
    const bottomMesh = new THREE.Mesh(bottomGeo, baseMaterial);
    bottomMesh.position.set(0, -d / 2, 0);
    bottomMesh.castShadow = true;
    this.addEdgeLines(bottomMesh, bottomGeo, edgeMaterial);
    bottomPivot.add(bottomMesh);
    group.add(bottomPivot);

    const leftPivot = new THREE.Group();
    leftPivot.position.set(-w / 2, 0, 0);
    const leftGeo = new THREE.PlaneGeometry(d, h);
    this.disposables.push(leftGeo);
    const leftMesh = new THREE.Mesh(leftGeo, baseMaterial);
    leftMesh.position.set(-d / 2, 0, 0);
    leftMesh.castShadow = true;
    this.addEdgeLines(leftMesh, leftGeo, edgeMaterial);
    leftPivot.add(leftMesh);
    group.add(leftPivot);

    const rightPivot = new THREE.Group();
    rightPivot.position.set(w / 2, 0, 0);
    const rightGeo = new THREE.PlaneGeometry(d, h);
    this.disposables.push(rightGeo);
    const rightMesh = new THREE.Mesh(rightGeo, baseMaterial);
    rightMesh.position.set(d / 2, 0, 0);
    rightMesh.castShadow = true;
    this.addEdgeLines(rightMesh, rightGeo, edgeMaterial);
    rightPivot.add(rightMesh);

    const backPivot = new THREE.Group();
    backPivot.position.set(d, 0, 0);
    const backGeo = new THREE.PlaneGeometry(w, h);
    this.disposables.push(backGeo);
    const backMesh = new THREE.Mesh(backGeo, baseMaterial);
    backMesh.position.set(w / 2, 0, 0);
    backMesh.castShadow = true;
    this.addEdgeLines(backMesh, backGeo, edgeMaterial);
    backPivot.add(backMesh);
    rightPivot.add(backPivot);

    group.add(rightPivot);

    return {
      id: box.id,
      group,
      topPivot,
      bottomPivot,
      leftPivot,
      rightPivot,
      backPivot,
      centerPosition,
      centerQuaternion,
      targetPosition,
      targetQuaternion,
      stepIndices,
    };
  }

  private createSpikeNode(spike: ModelSpike): SpikeRigNode {
    const s = spike.size;
    const group = new THREE.Group();

    const centerPosition = new THREE.Vector3(spike.x, 30, 0);
    const centerQuaternion = new THREE.Quaternion();

    const targetPosition = new THREE.Vector3(spike.x, -spike.y, spike.z);
    const targetQuaternion = new THREE.Quaternion();

    const shape = new THREE.Shape();
    shape.moveTo(-s / 2, 0);
    shape.lineTo(s / 2, 0);
    shape.lineTo(0, s);
    shape.closePath();

    const geometry = new THREE.ShapeGeometry(shape);
    this.disposables.push(geometry);

    const material = new THREE.MeshStandardMaterial({
      color: spike.hue,
      roughness: 0.82,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    this.disposables.push(material);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    group.add(mesh);

    return {
      group,
      centerPosition,
      centerQuaternion,
      targetPosition,
      targetQuaternion,
    };
  }

  private addEdgeLines(mesh: THREE.Mesh, geometry: THREE.BufferGeometry, material: THREE.LineBasicMaterial): void {
    const edges = new THREE.EdgesGeometry(geometry);
    this.disposables.push(edges);
    const line = new THREE.LineSegments(edges, material);
    mesh.add(line);
  }

  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }
}
