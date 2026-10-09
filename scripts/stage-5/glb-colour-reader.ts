import { readFileSync } from 'node:fs';
import { TextureSampler } from '../common/glb/texture-sampler.js';
import type {
  ColouredTriangle,
  GltfColourAccessor,
  GltfColourDocument,
  Vec3,
} from './interfaces/assembly.interface.js';

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const WHITE: readonly [number, number, number] = [255, 255, 255];

export class GlbColourReader {
  public static async read(path: string, scale: number): Promise<readonly ColouredTriangle[]> {
    const glb = readFileSync(path);
    const jsonLength = glb.readUInt32LE(12);
    const document = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength)) as GltfColourDocument;
    const binary = glb.subarray(20 + jsonLength + 8);
    const samplers = await this.loadSamplers(document, binary);
    const triangles: ColouredTriangle[] = [];

    for (const primitive of document.meshes[0].primitives) {
      const positions = this.floats(document, binary, primitive.attributes.POSITION, 3);
      const uvs = this.floats(document, binary, primitive.attributes.TEXCOORD_0, 2);
      const indices = this.indices(document, binary, primitive.indices);
      const material = document.materials[primitive.material];
      const textureIndex =
        material?.emissiveTexture?.index ??
        material?.pbrMetallicRoughness?.baseColorTexture?.index;
      const sampler = textureIndex === undefined ? undefined : samplers.get(textureIndex);
      for (let corner = 0; corner + 2 < indices.length; corner += 3) {
        const trio = [indices[corner], indices[corner + 1], indices[corner + 2]];
        triangles.push({
          corners: trio.map((vertex) => this.toSolidSpace(positions, vertex, scale)) as [
            Vec3,
            Vec3,
            Vec3,
          ],
          colour: sampler === undefined ? WHITE : this.average(sampler, uvs, trio),
        });
      }
    }
    return triangles;
  }

  private static async loadSamplers(
    document: GltfColourDocument,
    binary: Buffer,
  ): Promise<ReadonlyMap<number, TextureSampler>> {
    const samplers = new Map<number, TextureSampler>();
    for (const [index, texture] of document.textures.entries()) {
      const view = document.bufferViews[document.images[texture.source].bufferView];
      const start = view.byteOffset ?? 0;
      samplers.set(
        index,
        await TextureSampler.load(binary.subarray(start, start + view.byteLength)),
      );
    }
    return samplers;
  }

  private static average(
    sampler: TextureSampler,
    uvs: Float32Array,
    trio: readonly number[],
  ): readonly [number, number, number] {
    const u = (uvs[trio[0] * 2] + uvs[trio[1] * 2] + uvs[trio[2] * 2]) / 3;
    const v = (uvs[trio[0] * 2 + 1] + uvs[trio[1] * 2 + 1] + uvs[trio[2] * 2 + 1]) / 3;
    const { red, green, blue } = sampler.colourAt(u, v);
    return [red, green, blue];
  }

  private static toSolidSpace(positions: Float32Array, vertex: number, scale: number): Vec3 {
    const x = positions[vertex * 3];
    const y = positions[vertex * 3 + 1];
    const z = positions[vertex * 3 + 2];
    return [x * scale, -z * scale, y * scale];
  }

  private static view(
    document: GltfColourDocument,
    binary: Buffer,
    accessor: GltfColourAccessor,
  ): Buffer {
    const view = document.bufferViews[accessor.bufferView];
    if (view.byteStride !== undefined) throw new Error('Interleaved GLB buffers are not supported');
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return binary.subarray(start);
  }

  private static floats(
    document: GltfColourDocument,
    binary: Buffer,
    accessorIndex: number,
    width: number,
  ): Float32Array {
    const accessor = document.accessors[accessorIndex];
    if (accessor.componentType !== FLOAT) throw new Error('Expected float accessor');
    const bytes = this.view(document, binary, accessor);
    return new Float32Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + accessor.count * width * 4),
    );
  }

  private static indices(
    document: GltfColourDocument,
    binary: Buffer,
    accessorIndex: number,
  ): Uint32Array {
    const accessor = document.accessors[accessorIndex];
    const bytes = this.view(document, binary, accessor);
    const values = new Uint32Array(accessor.count);
    for (let position = 0; position < accessor.count; position++) {
      if (accessor.componentType === UNSIGNED_SHORT)
        values[position] = bytes.readUInt16LE(position * 2);
      else if (accessor.componentType === UNSIGNED_INT)
        values[position] = bytes.readUInt32LE(position * 4);
      else throw new Error(`Unsupported index type ${accessor.componentType}`);
    }
    return values;
  }
}
