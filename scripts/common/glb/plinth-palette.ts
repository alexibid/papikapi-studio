import type { Colour, PlinthPaletteParameters } from './glb.interface.js';

const DEGREES_PER_TURN = 360;
const HUE_SEGMENT = 60;

export class PlinthPalette {
  public static matches(colour: Colour, parameters: PlinthPaletteParameters): boolean {
    const red = colour.red / 255;
    const green = colour.green / 255;
    const blue = colour.blue / 255;
    const brightest = Math.max(red, green, blue);
    const spread = brightest - Math.min(red, green, blue);
    if (brightest < parameters.plinth_min_value || spread / brightest < parameters.plinth_min_saturation) return false;
    const hue = this.hue(red, green, blue, brightest, spread);
    return hue >= parameters.plinth_hue_min_deg && hue <= parameters.plinth_hue_max_deg;
  }

  private static hue(red: number, green: number, blue: number, brightest: number, spread: number): number {
    if (brightest === red) return (HUE_SEGMENT * (((green - blue) / spread) % 6) + DEGREES_PER_TURN) % DEGREES_PER_TURN;
    if (brightest === green) return HUE_SEGMENT * ((blue - red) / spread + 2);
    return HUE_SEGMENT * ((red - green) / spread + 4);
  }
}
