import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigureSystemPrompt } from '../src/app/application/services/figure-prompt';
import { AgeTierId } from '../src/app/domain/models/age-tier';
import { LabAttempt, LabRun } from '../src/app/domain/models/lab-run';
import { PaperFigure } from '../src/app/domain/models/paper-figure';
import { unfoldFigure } from '../src/app/domain/services/figure-unfolder';
import { parseWireFigure, WireFigure } from '../src/app/domain/services/figure-wire';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(APP_ROOT, 'src/assets/lab');
const RUNS_FILE = resolve(OUT_DIR, 'runs.json');
const MAX_RUNS = 20;
const MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
];
const BUDGET_FILE = resolve(APP_ROOT, '.lab-budget.json');
const DEFAULT_DAILY_BUDGET = 40;

const DEFAULT_THEMES: readonly string[] = [
  'A space rocket with fins and a round window',
  'A seated cat with pointed ears and a long tail',
  'A tropical fish with large fins',
  'An open-box truck with wheels',
  'A bipedal tyrannosaurus rex with an open jaw',
];

function readApiKey(): string {
  const env = readFileSync(resolve(APP_ROOT, '.env'), 'utf8');
  const key = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
  if (!key) {
    throw new Error('GEMINI_API_KEY em falta no .env');
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function slug(theme: string): string {
  return theme.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

async function callModel(
  theme: string,
  model: string,
  tier: AgeTierId,
  key: string
): Promise<WireFigure> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: theme }] }],
        systemInstruction: { parts: [{ text: buildFigureSystemPrompt(tier) }] },
        generationConfig: {
        responseMimeType: 'application/json',
        ...(thinkingEnabled ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
      },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (${model})`);
  }

  const payload = await response.json();
  const text: string | undefined = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`resposta vazia (${model})`);
  }

  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(clean) as WireFigure;
}

async function askGemini(
  theme: string,
  tier: AgeTierId,
  key: string,
  models: readonly string[]
): Promise<{ wire: WireFigure; model: string }> {
  let last = 'sem tentativas';
  for (const model of models) {
    for (let retry = 0; retry < 2; retry++) {
      try {
        spendRequest();
        return { wire: await callModel(theme, model, tier, key), model };
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
        if (!last.includes('503')) break;
        await sleep(3000);
      }
    }
  }
  throw new Error(last);
}

async function runTheme(
  theme: string,
  tier: AgeTierId,
  key: string,
  models: readonly string[]
): Promise<LabAttempt> {
  try {
    const { wire, model } = await askGemini(theme, tier, key, models);
    const figure: PaperFigure = parseWireFigure(wire, tier);
    const unfolded = unfoldFigure(figure);
    return {
      id: slug(theme),
      theme,
      model,
      plateCount: figure.plates.length,
      errors: unfolded.errors,
      figure,
    };
  } catch (err) {
    return {
      id: slug(theme),
      theme,
      model: '-',
      plateCount: 0,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

interface DailyBudget {
  readonly date: string;
  readonly count: number;
}

let budgetLimit = DEFAULT_DAILY_BUDGET;

let thinkingEnabled = true;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function readBudget(): DailyBudget {
  if (!existsSync(BUDGET_FILE)) return { date: today(), count: 0 };
  try {
    const parsed = JSON.parse(readFileSync(BUDGET_FILE, 'utf8')) as DailyBudget;
    return parsed.date === today() ? parsed : { date: today(), count: 0 };
  } catch {
    return { date: today(), count: 0 };
  }
}

function spendRequest(): void {
  const budget = readBudget();
  if (budget.count >= budgetLimit) {
    throw new Error(
      `teto local atingido: ${budget.count}/${budgetLimit} pedidos hoje. ` +
        'Usa --budget=N para levantar, ou espera pela reposicao diaria.'
    );
  }
  writeFileSync(BUDGET_FILE, JSON.stringify({ date: today(), count: budget.count + 1 }));
}

function readExistingRuns(): readonly LabRun[] {
  if (!existsSync(RUNS_FILE)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(RUNS_FILE, 'utf8'));
    return Array.isArray(parsed) ? (parsed as LabRun[]) : [];
  } catch {
    return [];
  }
}

function flagValue(args: readonly string[], name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tier = (flagValue(args, 'tier') ?? 'tier-7-10') as AgeTierId;
  const title = flagValue(args, 'title') ?? 'Bateria base';
  const themes = args.filter((arg) => !arg.startsWith('--'));
  const list = themes.length > 0 ? themes : DEFAULT_THEMES;
  budgetLimit = Number(flagValue(args, 'budget') ?? DEFAULT_DAILY_BUDGET);
  thinkingEnabled = !args.includes('--no-thinking');
  const forced = flagValue(args, 'model');
  const models = forced ? [forced] : MODELS;
  const key = readApiKey();

  const attempts: LabAttempt[] = [];
  for (const theme of list) {
    const attempt = await runTheme(theme, tier, key, models);
    attempts.push(attempt);
    const status = attempt.errors.length === 0 ? 'OK   ' : 'FALHA';
    console.log(`${status} ${String(attempt.plateCount).padStart(2)} placas  ${theme.slice(0, 46)}`);
    attempt.errors.forEach((error) => console.log('        ! ' + error));
  }

  const now = new Date();
  const run: LabRun = {
    id: `run-${now.toISOString().replace(/[:.]/g, '-')}`,
    ranAt: now.toLocaleString('pt-PT'),
    tierId: tier,
    title,
    attempts,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(RUNS_FILE, JSON.stringify([run, ...readExistingRuns()].slice(0, MAX_RUNS), null, 2));
  const spent = readBudget();
  console.log(`\nCorrida guardada. Pedidos hoje: ${spent.count}/${budgetLimit}.`);
  console.log('Abre /lab no estudio para ver o resultado.');
}

main();
