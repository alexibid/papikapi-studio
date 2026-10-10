import { FigurePublisher } from './common/figure-publisher.js';

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const everything = process.argv.includes('--all');

if (!everything && requested.length === 0) {
  console.error('Usage: publish:figures --all | <model-id> [<model-id> ...]');
  process.exit(1);
}

try {
  const report = everything ? FigurePublisher.publishAll() : FigurePublisher.publish(requested);
  console.log(`Published ${report.copied.length} file(s) to ${report.targetDir}`);
  console.log(`Catalogue index lists ${report.indexed} figure(s).`);
} catch (error) {
  console.error(`[publish] ${(error as Error).message}`);
  process.exit(1);
}
