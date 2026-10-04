import type { PageFrame } from './interfaces/booklet.interface.js';
import type { Placement, TextureLayout } from './interfaces/layout.interface.js';
import { placePoint } from './placement-transform.js';

export function buildTextureLayout(
  placements: readonly Placement[],
  frame: PageFrame,
): TextureLayout {
  const faces = placements.flatMap((placement) =>
    placement.artwork.faces.map((face, index) => ({
      id: placement.artwork.faceIds[index],
      page: placement.page,
      points: face.map((point) => placePoint(point, placement, frame.margin)),
    })),
  );
  const pages = Math.max(...placements.map((placement) => placement.page)) + 1;
  return { pageWidthMm: frame.width, pageHeightMm: frame.height, pages, faces };
}
