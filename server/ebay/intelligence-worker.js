import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTERVAL_MINUTES = Math.max(15, Number(process.env.UH_INTELLIGENCE_INTERVAL_MINUTES || 60));
let running = false;

function collect() {
  if (running) return;
  running = true;
  const startedAt = new Date().toISOString();
  console.log(`[${startedAt}] intelligence collection starting`);

  const child = spawn(process.execPath, ['collect-intelligence.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env
  });

  child.on('exit', (code) => {
    running = false;
    console.log(`[${new Date().toISOString()}] intelligence collection finished code=${code}`);
  });

  child.on('error', (error) => {
    running = false;
    console.error(`[${new Date().toISOString()}] intelligence collection error: ${error.message}`);
  });
}

console.log(`UltraHype intelligence worker online; interval=${INTERVAL_MINUTES}m`);
collect();
setInterval(collect, INTERVAL_MINUTES * 60_000);
