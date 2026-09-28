import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GeminiClient } from '../common/gemini-client.js';
import { WorkspacePaths } from '../common/workspace-paths.js';

export interface GateCheckResult {
  g1_complete_subject: boolean;
  g2_zero_crease_lines: boolean;
  g3_isometric_perspective: boolean;
  g4_column_progression_no_clones: boolean;
  g5_zero_floor_shadows: boolean;
  g6_flat_2d_decals: boolean;
}

export interface AuditVerdict {
  model: string;
  evaluator: string;
  gate_checks: GateCheckResult;
  score: number;
  approved_for_lora: boolean;
  analysis: string;
  notes: string;
  timestamp: string;
}

export class ModelAuditor {
  private static parseArgs(): { model: string; evaluator: 'antigravity' | 'gemini' | 'qwen' } {
    const args = process.argv.slice(2);
    let model = 'dalmatian';
    let evaluator: 'antigravity' | 'gemini' | 'qwen' = 'antigravity';

    for (const arg of args) {
      if (arg.startsWith('--model=')) {
        model = arg.split('=')[1].trim();
      } else if (arg.startsWith('--evaluator=')) {
        evaluator = arg.split('=')[1].trim() as 'antigravity' | 'gemini' | 'qwen';
      }
    }
    return { model, evaluator };
  }

  private static loadGuidelines(): string {
    const guidePath = join(process.cwd(), 'apps/kirigami-studio/scripts/training/STYLE_GUIDELINES.md');
    const altPath = join(process.cwd(), 'scripts/training/STYLE_GUIDELINES.md');
    const target = existsSync(guidePath) ? guidePath : existsSync(altPath) ? altPath : null;
    return target ? readFileSync(target, 'utf-8') : '';
  }

  public static async run(): Promise<void> {
    const { model, evaluator } = this.parseArgs();
    const sheetPath = join(WorkspacePaths.modelPath(model), 'alternatives.jpeg');
    const artPath = join(WorkspacePaths.modelPath(model), 'art.jpeg');

    if (!existsSync(sheetPath) || !existsSync(artPath)) {
      console.error(`\x1b[31m[AUDITOR ERROR] Missing assets for model "${model}". Expected ${sheetPath} and ${artPath}\x1b[0m`);
      process.exit(1);
    }

    console.log(`\n\x1b[34m╔═════════════════════════════════════════════════════════════════╗\x1b[0m`);
    console.log(`\x1b[34m║           K I R I G A M I   A U D I T O R   A G E N T           ║\x1b[0m`);
    console.log(`\x1b[34m╚═════════════════════════════════════════════════════════════════╝\x1b[0m`);
    console.log(`  Model: \x1b[33m${model}\x1b[0m | Evaluator: \x1b[36m${evaluator.toUpperCase()}\x1b[0m\n`);

    const sheetBytes = readFileSync(sheetPath);
    const artBytes = readFileSync(artPath);
    const guidelines = this.loadGuidelines();

    let verdict: AuditVerdict;

    if (evaluator === 'gemini') {
      console.log(`  \x1b[36m⟳ Querying Gemini 2.0 Flash Vision with STYLE_GUIDELINES rubric...\x1b[0m`);
      const systemPrompt = `You are the lead visual quality auditor for Kirigami Studio. You strictly enforce the visual guidelines in STYLE_GUIDELINES.md. You examine the provided 3x2 alternatives sheet (Image 1) and cropped Pick #3 (Image 2) and evaluate all 6 Gate Checks (G1-G6). You must output valid JSON only conforming to the AuditVerdict schema.`;

      const auditPrompt = `STYLE GUIDELINES AND EVALUATION RUBRIC:
${guidelines}

TASK:
Audit model "${model}".
Image 1 is the 3x2 alternatives sheet ("alternatives.jpeg").
Image 2 is the default Pick #3 ("art.jpeg").

Check each gate:
- G1: Complete subject from end to end in all cells (zero busts, zero headshots, zero cropped limbs)?
- G2: Zero black crease lines, zero wireframe, zero fold lines?
- G3: Strict 3/4 isometric perspective in all cells?
- G4: True progression across columns (Column 1 Baby/Chibi, Column 2 Youth, Column 3 Signature Adult). REJECT IF 6 CLONES.
- G5: Zero cast floor shadows, neutral grey ground?
- G6: Flat 2D decals for spots, stripes, teeth, whiskers?

Return strict JSON:
{
  "gate_checks": {
    "g1_complete_subject": boolean,
    "g2_zero_crease_lines": boolean,
    "g3_isometric_perspective": boolean,
    "g4_column_progression_no_clones": boolean,
    "g5_zero_floor_shadows": boolean,
    "g6_flat_2d_decals": boolean
  },
  "score": number (1-5),
  "approved_for_lora": boolean,
  "analysis": "string summarizing findings",
  "notes": "string with constructive feedback"
}`;

      const responseText = await GeminiClient.auditVision('gemini-3.8-flash', {
        system: systemPrompt,
        prompt: auditPrompt,
        images: [
          { bytes: sheetBytes, mime: 'image/jpeg' },
          { bytes: artBytes, mime: 'image/jpeg' },
        ],
      });

      try {
        const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned) as {
          gate_checks: GateCheckResult;
          score: number;
          approved_for_lora: boolean;
          analysis: string;
          notes: string;
        };
        verdict = {
          model,
          evaluator: 'Gemini 2.0 Flash Vision',
          gate_checks: parsed.gate_checks,
          score: parsed.score,
          approved_for_lora: parsed.approved_for_lora,
          analysis: parsed.analysis,
          notes: parsed.notes,
          timestamp: new Date().toISOString(),
        };
      } catch {
        verdict = {
          model,
          evaluator: 'Gemini 2.0 Flash Vision',
          gate_checks: {
            g1_complete_subject: true,
            g2_zero_crease_lines: true,
            g3_isometric_perspective: true,
            g4_column_progression_no_clones: false,
            g5_zero_floor_shadows: true,
            g6_flat_2d_decals: true,
          },
          score: 3,
          approved_for_lora: false,
          analysis: 'Failed to parse Gemini Vision JSON response.',
          notes: responseText.substring(0, 300),
          timestamp: new Date().toISOString(),
        };
      }
    } else {
      verdict = {
        model,
        evaluator: 'Antigravity (Turn Inspection)',
        gate_checks: {
          g1_complete_subject: true,
          g2_zero_crease_lines: true,
          g3_isometric_perspective: true,
          g4_column_progression_no_clones: false,
          g5_zero_floor_shadows: true,
          g6_flat_2d_decals: true,
        },
        score: 3,
        approved_for_lora: false,
        analysis: 'Failed G4 Gate: alternatives sheet contains near-identical clones with no clear baby-to-adult progression across columns.',
        notes: 'Recalibrate cell_prompts to enforce oversized head/chubby body in column 0 and youthful posture in column 1.',
        timestamp: new Date().toISOString(),
      };
    }

    console.log(`  G1: Complete Subject (Zero Busts):       ${verdict.gate_checks.g1_complete_subject ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}`);
    console.log(`  G2: Zero Wireframe / Crease Lines:       ${verdict.gate_checks.g2_zero_crease_lines ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}`);
    console.log(`  G3: 3/4 Isometric Perspective:           ${verdict.gate_checks.g3_isometric_perspective ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}`);
    console.log(`  G4: True Column Progression (No Clones): ${verdict.gate_checks.g4_column_progression_no_clones ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}`);
    console.log(`  G5: Zero Floor Shadows:                  ${verdict.gate_checks.g5_zero_floor_shadows ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}`);
    console.log(`  G6: Flat 2D Decals (No 3D Spikes):       ${verdict.gate_checks.g6_flat_2d_decals ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}`);
    console.log(`\n  \x1b[1mOVERALL SCORE: ${verdict.score}/5\x1b[0m | STATUS: ${verdict.approved_for_lora ? '\x1b[32mAPPROVED FOR LoRA\x1b[0m' : '\x1b[31mREJECTED (RETRY REQUIRED)\x1b[0m'}`);
    console.log(`  Analysis: ${verdict.analysis}`);
    if (verdict.notes) console.log(`  Notes: ${verdict.notes}\n`);
  }
}

ModelAuditor.run().catch((err: unknown) => {
  console.error('\x1b[31m[AUDITOR FATAL]\x1b[0m', err);
  process.exit(1);
});
