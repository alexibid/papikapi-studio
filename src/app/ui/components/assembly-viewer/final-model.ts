import { Box3, BufferGeometry, Group, Material, Mesh, Sphere, Texture, Vector3 } from 'three';

export class FinalModel {
  constructor(readonly root: Group) {}

  alignTo(target: Sphere): void {
    this.root.position.set(0, 0, 0);
    this.root.scale.setScalar(1);
    this.root.updateMatrixWorld(true);
    const own = new Box3().setFromObject(this.root).getBoundingSphere(new Sphere());
    const scale = target.radius / (own.radius || 1);
    this.root.scale.setScalar(scale);
    this.root.position.copy(target.center).sub(new Vector3().copy(own.center).multiplyScalar(scale));
  }

  show(visible: boolean): void {
    this.root.visible = visible;
  }

  dispose(): void {
    this.root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      (node.geometry as BufferGeometry).dispose();
      const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value instanceof Texture) value.dispose();
        });
        material.dispose();
      });
    });
  }
}
