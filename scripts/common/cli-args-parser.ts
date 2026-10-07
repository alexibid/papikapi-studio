import type { CliArguments } from '../orchestrator.interface.js';

export class CliArgsParser {
  public static parse(): CliArguments {
    const rawArgs = process.argv.slice(2);
    const args: string[] = [];
    for (let i = 0; i < rawArgs.length; i++) {
      const a = rawArgs[i];
      if (a === '--args' && rawArgs[i + 1] !== undefined) {
        args.push(...rawArgs[++i].split(/\s+/).filter(Boolean));
      } else if (a.startsWith('--args=')) {
        args.push(...a.slice('--args='.length).split(/\s+/).filter(Boolean));
      } else {
        args.push(a);
      }
    }
    const flags: CliArguments = {
      stage: null,
      step: null,
      fromStep: null,
      finish: process.env.npm_config_finish === 'true',
      force: false,
      model: null,
      pick: null,
      prompt: null,
      ref: null,
    };

    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--stage' && args[i + 1] !== undefined)
        flags.stage = Number.parseInt(args[++i], 10);
      else if (a.startsWith('--stage=')) flags.stage = Number.parseInt(a.split('=')[1], 10);
      else if (a === '--step' && args[i + 1] !== undefined) flags.step = args[++i];
      else if (a.startsWith('--step=')) flags.step = a.split('=')[1];
      else if (a === '--from-step' && args[i + 1] !== undefined) flags.fromStep = args[++i];
      else if (a.startsWith('--from-step=')) flags.fromStep = a.split('=')[1];
      else if (a === '--finish') flags.finish = true;
      else if (a === '--force') flags.force = true;
      else if ((a === '--model' ? true : a === '--subject') && args[i + 1] !== undefined)
        flags.model = args[++i];
      else if (a.startsWith('--model=') ? true : a.startsWith('--subject='))
        flags.model = a.split('=')[1];
      else if (a === '--pick' && args[i + 1] !== undefined)
        flags.pick = Number.parseInt(args[++i], 10);
      else if (a.startsWith('--pick=')) flags.pick = Number.parseInt(a.split('=')[1], 10);
      else if (a === '--prompt' && args[i + 1] !== undefined) flags.prompt = args[++i];
      else if (a.startsWith('--prompt=')) flags.prompt = a.split('=')[1];
      else if (a === '--ref' && args[i + 1] !== undefined) flags.ref = args[++i];
      else if (a.startsWith('--ref=')) flags.ref = a.split('=')[1];
      else if (!a.startsWith('-') && !flags.model) flags.model = a;
    }
    return flags;
  }
}
