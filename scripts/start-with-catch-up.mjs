// Keeps the indexer near the chain head without fetching every block.
//
// Realtime sync fetches Base blocks one at a time and can't keep up at the slow
// pollingInterval in ponder.config.ts. A restart resumes from the last
// checkpoint and reads the gap with ranged eth_getLogs, which takes a few calls
// instead of one per block.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const RESTART_INTERVAL_MS = 60 * 60 * 1000;
const RESTART_DELAY_MS = 30 * 1000;
const STOP_TIMEOUT_MS = 60 * 1000;

let ponder;
let shuttingDown = false;

const stop = (child) => {
  child.kill("SIGTERM");
  const forceKill = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
  child.once("close", () => clearTimeout(forceKill));
};

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    shuttingDown = true;
    if (ponder) stop(ponder);
    else process.exit(0);
  });
}

while (!shuttingDown) {
  ponder = spawn(
    "node_modules/.bin/ponder",
    ["start", ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  const restart = setTimeout(() => stop(ponder), RESTART_INTERVAL_MS);
  await new Promise((resolve) => ponder.once("close", resolve));
  clearTimeout(restart);
  ponder = undefined;
  if (!shuttingDown) await sleep(RESTART_DELAY_MS);
}
