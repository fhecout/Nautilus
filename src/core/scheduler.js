import { runDueAutomations } from './automations.js';

let intervalId = null;
let startupDone = false;

export function startAutomationScheduler(agent, options = {}) {
  const intervalMs = options.intervalMs ?? 60_000;
  const projectRoot = options.projectRoot || process.cwd();

  if (!startupDone) {
    startupDone = true;
    runDueAutomations({ ledger: agent.ledger, projectRoot }).catch(error => {
      console.warn(`[automations] startup: ${error.message}`);
    });
  }

  if (intervalId) return () => clearInterval(intervalId);

  intervalId = setInterval(() => {
    runDueAutomations({ ledger: agent.ledger, projectRoot }).catch(error => {
      console.warn(`[automations] tick: ${error.message}`);
    });
  }, intervalMs);

  return () => {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  };
}
