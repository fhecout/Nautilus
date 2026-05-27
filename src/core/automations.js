import fs from 'node:fs';
import path from 'node:path';
import { executeTool } from '../tools/index.js';
import { getSystemSnapshot } from './systemInfo.js';
import {
  formatTasksForBriefing,
  getCompletedTasksSince,
  getOverdueTasks,
  getPlannerTaskStats,
  getTodayTasks
} from './planner.js';
import { formatRadarReport, scanProject } from './problemRadar.js';

const STATE_PATH = path.resolve(
  process.cwd(),
  'data',
  process.env.AUTOMATIONS_STATE_FILE || 'automations-state.json'
);

export const BUILTIN_AUTOMATIONS = [
  {
    id: 'morning-briefing',
    name: 'Briefing da manha',
    description: 'Ao abrir o Nautilus de manha: briefing, Gmail, tarefas de hoje e status do PC.',
    trigger: { type: 'on_startup', hours: [5, 6, 7, 8, 9, 10, 11] },
    enabled: true,
    steps: ['briefing', 'gmail', 'tasks_today', 'system_status', 'radar_quick']
  },
  {
    id: 'friday-review',
    name: 'Revisao de sexta',
    description: 'Toda sexta: resumo semanal, tarefas concluidas, atrasadas e plano da proxima semana.',
    trigger: { type: 'weekly', weekday: 5, hour: 17 },
    enabled: true,
    steps: ['weekly_summary', 'tasks_completed_week', 'tasks_overdue', 'next_week_plan']
  },
  {
    id: 'evening-wrap',
    name: 'Fechamento do dia',
    description: 'Resumo do dia, tarefas em aberto e status do sistema.',
    trigger: { type: 'daily', hour: 18 },
    enabled: true,
    steps: ['briefing', 'tasks_today', 'tasks_overdue', 'system_status']
  },
  {
    id: 'inbox-sweep',
    name: 'Varredura de inbox',
    description: 'Checagem rapida do Gmail em dias uteis.',
    trigger: { type: 'weekdays', hour: 9 },
    enabled: true,
    steps: ['gmail']
  },
  {
    id: 'health-check',
    name: 'Health check',
    description: 'Telemetria do PC + radar rapido de problemas do projeto.',
    trigger: { type: 'daily', hour: 8 },
    enabled: true,
    steps: ['system_status', 'radar_quick']
  },
  {
    id: 'project-pulse',
    name: 'Pulso do projeto',
    description: 'Varredura completa do radar e estatisticas de tarefas.',
    trigger: { type: 'manual' },
    enabled: true,
    steps: ['radar_full', 'tasks_stats']
  },
  {
    id: 'monday-kickoff',
    name: 'Kickoff de segunda',
    description: 'Plano da semana com tarefas pendentes e radar.',
    trigger: { type: 'weekly', weekday: 1, hour: 8 },
    enabled: true,
    steps: ['briefing', 'tasks_overdue', 'next_week_plan', 'radar_quick']
  },
  {
    id: 'safe-mode-audit',
    name: 'Auditoria Safe Mode',
    description: 'Verifica lacunas de Safe Mode e alertas do radar.',
    trigger: { type: 'weekly', weekday: 3, hour: 10 },
    enabled: true,
    steps: ['radar_full']
  }
];

export function listAutomations() {
  const state = loadState();
  return BUILTIN_AUTOMATIONS.map(automation => ({
    ...automation,
    lastRunAt: state.lastRuns[automation.id] || null,
    shouldRunNow: shouldRunAutomation(automation, state)
  }));
}

export function getAutomation(id) {
  return BUILTIN_AUTOMATIONS.find(item => item.id === id) || null;
}

export async function runAutomation(id, context = {}) {
  const automation = getAutomation(id);
  if (!automation) {
    throw new Error(`Automacao '${id}' nao encontrada.`);
  }

  const sections = [];
  for (const step of automation.steps) {
    sections.push(await runStep(step, context));
  }

  const report = {
    id: automation.id,
    name: automation.name,
    ranAt: new Date().toISOString(),
    sections,
    text: sections.map(section => `## ${section.title}\n${section.body}`).join('\n\n')
  };

  const state = loadState();
  state.lastRuns[automation.id] = report.ranAt;
  saveState(state);
  return report;
}

export async function runDueAutomations(context = {}) {
  const state = loadState();
  const due = BUILTIN_AUTOMATIONS.filter(automation => automation.enabled && shouldRunAutomation(automation, state));
  const results = [];
  for (const automation of due) {
    results.push(await runAutomation(automation.id, context));
  }
  return results;
}

export function shouldRunAutomation(automation, state = loadState()) {
  const trigger = automation.trigger || { type: 'manual' };
  const now = new Date();
  const lastRun = state.lastRuns[automation.id];

  if (trigger.type === 'manual') return false;
  if (trigger.type === 'on_startup') {
    if (!trigger.hours?.includes(now.getHours())) return false;
    return !ranToday(lastRun, now);
  }
  if (trigger.type === 'daily') {
    if (now.getHours() < (trigger.hour ?? 0)) return false;
    return !ranToday(lastRun, now);
  }
  if (trigger.type === 'weekdays') {
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    if (now.getHours() < (trigger.hour ?? 0)) return false;
    return !ranToday(lastRun, now);
  }
  if (trigger.type === 'weekly') {
    if (now.getDay() !== trigger.weekday) return false;
    if (now.getHours() < (trigger.hour ?? 0)) return false;
    return !ranThisWeek(lastRun, now);
  }
  return false;
}

async function runStep(step, context) {
  switch (step) {
    case 'briefing':
      return section('Briefing', buildBriefing());
    case 'gmail':
      return section('Gmail', await safeGmailCheck());
    case 'tasks_today':
      return section('Tarefas de hoje', formatTasksForBriefing(getTodayTasks(), 'Hoje'));
    case 'tasks_overdue':
      return section('Tarefas atrasadas', formatTasksForBriefing(getOverdueTasks(), 'Atrasadas'));
    case 'tasks_completed_week': {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return section(
        'Concluidas na semana',
        formatTasksForBriefing(getCompletedTasksSince(weekAgo), 'Concluidas')
      );
    }
    case 'tasks_stats': {
      const stats = getPlannerTaskStats();
      return section(
        'Estatisticas de tarefas',
        `Abertas: ${stats.open}\nConcluidas: ${stats.done}\nAtrasadas: ${stats.overdue}\nHoje: ${stats.today}`
      );
    }
    case 'system_status':
      return section('Status do PC', await formatSystemStatus());
    case 'radar_quick': {
      const scan = scanProject({ root: context.projectRoot });
      const top = scan.issues.slice(0, 5);
      return section('Radar rapido', formatRadarReport({ ...scan, issues: top }));
    }
    case 'radar_full': {
      const scan = scanProject({ root: context.projectRoot });
      return section('Radar do projeto', formatRadarReport(scan));
    }
    case 'weekly_summary':
      return section('Resumo semanal', buildWeeklySummary(context.ledger));
    case 'next_week_plan':
      return section('Plano da proxima semana', buildNextWeekPlan());
    default:
      return section(step, 'Passo desconhecido.');
  }
}

function buildBriefing() {
  const now = new Date();
  const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' });
  const date = now.toLocaleDateString('pt-BR');
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return `${greeting}. Hoje e ${weekday}, ${date}.\nUse este painel para priorizar o que importa agora.`;
}

async function formatSystemStatus() {
  const snapshot = await getSystemSnapshot();
  const cpu = snapshot.cpu?.loadPercent ?? '?';
  const ram = snapshot.memory?.usedPercent ?? '?';
  const disk = snapshot.storage?.[0];
  const diskLine = disk
    ? `Disco ${disk.mount || disk.filesystem}: ${disk.usedPercent}% usado`
    : 'Disco: indisponivel';
  const temp = snapshot.cpu?.temperatureC ? `${snapshot.cpu.temperatureC}C` : 'indisponivel';
  return `CPU: ${cpu}%\nRAM: ${ram}%\nTemperatura: ${temp}\n${diskLine}`;
}

async function safeGmailCheck() {
  try {
    const result = await executeTool('read_gmail', { maxResults: 8, query: 'is:unread newer_than:2d' });
    return result?.finalAnswer || result?.modelInput || 'Gmail verificado.';
  } catch (error) {
    return `Gmail indisponivel: ${error.message}. Rode npm run gmail:auth se necessario.`;
  }
}

function buildWeeklySummary(ledger) {
  if (!ledger?.getStats) {
    return 'Resumo semanal: registre mais interacoes para estatisticas no Observatory.';
  }
  const stats = ledger.getStats();
  const topTools = (stats.topTools || []).slice(0, 3).map(t => `${t.toolName} (${t.count}x)`).join(', ');
  return [
    `Runs na semana (total ledger): ${stats.totalRuns ?? 0}`,
    `Tempo medio: ${stats.avgElapsedMs ?? 0}ms`,
    `Bloqueios Safe Mode: ${stats.safeModeBlocks ?? 0}`,
    topTools ? `Tools mais usadas: ${topTools}` : 'Tools: sem dados ainda.'
  ].join('\n');
}

function buildNextWeekPlan() {
  const overdue = getOverdueTasks();
  const today = getTodayTasks();
  const lines = [
    'Sugestao de plano:',
    '1. Fechar tarefas atrasadas de maior impacto.',
    '2. Bloquear 2-3 focos para a semana (maximo).',
    '3. Rodar health-check e project-pulse na segunda.',
    '4. Revisar inbox na sexta com friday-review.'
  ];
  if (overdue.length) lines.push(`Prioridade imediata: ${overdue.length} tarefa(s) atrasada(s).`);
  if (today.length) lines.push(`Para hoje ainda restam ${today.length} tarefa(s) em aberto.`);
  return lines.join('\n');
}

function section(title, body) {
  return { title, body: String(body || '').trim() };
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { lastRuns: {} };
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { lastRuns: {} };
  }
}

function saveState(state) {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function ranToday(lastRun, now) {
  if (!lastRun) return false;
  return lastRun.slice(0, 10) === now.toISOString().slice(0, 10);
}

function ranThisWeek(lastRun, now) {
  if (!lastRun) return false;
  const last = new Date(lastRun);
  const start = startOfWeek(now);
  return last >= start;
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
