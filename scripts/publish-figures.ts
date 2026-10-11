import { FigurePublisher } from './common/figure-publisher.js';

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const everything = process.argv.includes('--all');
const indexOnly = process.argv.includes('--index');
const waitForSync = process.argv.includes('--wait');
const skipDeploy = process.argv.includes('--no-deploy');

if (!everything && !indexOnly && requested.length === 0) {
  console.error('Usage: publish:figures --all | --index | <model-id> ... [--wait] [--no-deploy]');
  process.exit(1);
}

try {
  const report = indexOnly
    ? FigurePublisher.refreshIndex()
    : everything
      ? FigurePublisher.publishAll()
      : FigurePublisher.publish(requested);
  console.log(`Staged ${report.staged.length} file(s) and copied ${report.pdfsCopied.length} pdf(s).`);
  console.log(`Index lists ${report.indexed} figure(s), ${report.awaitingSync} pdf(s) still syncing to Drive.`);
  const settled = waitForSync && report.awaitingSync > 0 ? await FigurePublisher.waitForSync() : report;
  if (settled !== report) console.log(`Drive sync done, ${settled.awaitingSync} pdf(s) still waiting.`);
  if (!skipDeploy) FigurePublisher.deploy();
} catch (error) {
  console.error(`[publish] ${(error as Error).message}`);
  process.exit(1);
}
