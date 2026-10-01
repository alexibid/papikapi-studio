export interface ReferenceItem {
  readonly group: string;
  readonly name: string;
  readonly file: string;
  readonly caption: string;
}

export interface CaptionManifest {
  readonly trigger: string;
  readonly captions: Readonly<Record<string, string>>;
}

