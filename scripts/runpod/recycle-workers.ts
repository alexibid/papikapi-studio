/**
 * Recycles a serverless endpoint's workers after a new image is published (README §3): Max Workers to 0,
 * wait until no worker is left, then back to the previous value, so the next worker pulls `:latest`.
 * Only the worker count changes; the image, template and every other endpoint setting stay as they are.
 *
 * tsx scripts/runpod/recycle-workers.ts RUNPOD_FLUX_ENDPOINT_ID
 */
import { RunPodClient } from '../common/runpod-client.js';

const REST = 'https://rest.runpod.io/v1/endpoints';
const POLL_MS = 5000;
const MAX_POLLS = 36;

interface EndpointState {
  readonly workersMax: number;
  readonly workers?: readonly unknown[];
}

function isEndpointState(value: unknown): value is EndpointState {
  return typeof value === 'object' && value !== null && typeof (value as { workersMax?: unknown }).workersMax === 'number';
}

async function call(endpoint: string, init?: RequestInit): Promise<EndpointState> {
  const response = await fetch(`${REST}/${endpoint}?includeWorkers=true`, {
    ...init,
    headers: { Authorization: `Bearer ${RunPodClient.getApiKey()}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`RunPod answered ${response.status} for endpoint ${endpoint}`);
  const body: unknown = await response.json();
  if (!isEndpointState(body)) throw new Error('Unexpected endpoint description from RunPod');
  return body;
}

async function setMaxWorkers(endpoint: string, workersMax: number): Promise<void> {
  await call(endpoint, { method: 'PATCH', body: JSON.stringify({ workersMax }) });
}

async function waitUntilEmpty(endpoint: string): Promise<void> {
  for (let poll = 0; poll < MAX_POLLS; poll++) {
    const state = await call(endpoint);
    if ((state.workers ?? []).length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error('Workers did not stop in time; Max Workers is left at 0, set it back in the RunPod console');
}

async function main(): Promise<void> {
  const endpoint = RunPodClient.getEndpointId(process.argv[2] ?? 'RUNPOD_FLUX_ENDPOINT_ID');
  const { workersMax } = await call(endpoint);
  console.log(`Max Workers ${workersMax} -> 0`);
  await setMaxWorkers(endpoint, 0);
  await waitUntilEmpty(endpoint);
  await setMaxWorkers(endpoint, workersMax);
  const restored = await call(endpoint);
  console.log(`Max Workers back to ${restored.workersMax}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
