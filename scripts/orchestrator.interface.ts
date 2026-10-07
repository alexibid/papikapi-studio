export interface CliArguments {
  stage: number | null;
  step: string | null;
  fromStep: string | null;
  finish: boolean;
  force: boolean;
  model: string | null;
  pick: number | null;
  prompt: string | null;
  ref: string | null;
}
