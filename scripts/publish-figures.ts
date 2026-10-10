import { FigurePublisher } from './common/figure-publisher.js';

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const everything = process.argv.includes('--all');
const indexOnly = process.argv.includes('--index');
const waitForSync = process.argv.includes('--wait');

if (!everything && !indexOnly && requested.length === 0) {
  console.error('Usage: publish:figures --all | --index | <model-id> ... [--wait]');
  process.exit(1);
}

try {
  const report = indexOnly
    ? FigurePublisher.refreshIndex()
    : everything
      ? FigurePublisher.publishAll()
      : FigurePublisher.publish(requested);
  console.log(`Published ${report.copied.length} file(s) to ${report.targetDir}`);
  console.log(`Catalogue index lists ${report.indexed} figure(s), ${report.awaitingSync} file(s) still syncing.`);
  if (waitForSync && report.awaitingSync > 0) {
    const settled = await FigurePublisher.waitForSync();
    console.log(`Drive sync done: ${settled.awaitingSync} file(s) still waiting.`);
  }
} catch (error) {
  console.error(`[publish] ${(error as Error).message}`);
  process.exit(1);
}
