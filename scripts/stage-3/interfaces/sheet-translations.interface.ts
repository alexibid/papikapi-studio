export type LegendKind = 'cut' | 'mountain' | 'valley' | 'tab';

export interface LegendEntry {
  readonly kind: LegendKind;
  readonly label: string;
}

export interface CoverTexts {
  readonly subtitle: string;
  readonly info: readonly string[];
  readonly legend_title: string;
  readonly legend: readonly LegendEntry[];
  readonly method_title: string;
  readonly method: readonly string[];
}

export interface BookletTexts {
  readonly piece_prefix: string;
  readonly cover: CoverTexts;
  readonly steps_heading: string;
  readonly step_title: string;
  readonly step_sheet: string;
  readonly step_first: string;
  readonly step_fold: string;
  readonly step_join: string;
  readonly step_close: string;
  readonly sheet_heading: string;
  readonly sheet_pieces: string;
  readonly page_label: string;
}
