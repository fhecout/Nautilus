import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from './core/Agent.js';
import {
  getAutomation,
  listAutomations,
  runAutomation,
  runDueAutomations
} from './core/automations.js';
import { loadEnvFile } from './core/env.js';
import {
  deleteMemory,
  listMemories,
  saveMemory,
  updateMemory
} from './core/memory.js';
import {
  addProjectNote,
  createProject,
  createSubtask,
  createTask,
  deleteProject,
  deleteProjectNote,
  deleteSubtask,
  deleteTask,
  getProject,
  getTask,
  listHistory,
  listProjects,
  listTasks,
  updateProject,
  updateSubtask,
  updateTask
} from './core/planner.js';
import { scanProject } from './core/problemRadar.js';
import { startAutomationScheduler } from './core/scheduler.js';
import { AGENT_TEAM, DECISION_AGENT, DECISION_ROOM_AGENTS } from './core/subagents.js';
import { getSystemSnapshot } from './core/systemInfo.js';
import { availableTools } from './tools/index.js';

loadEnvFile();

const MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const PORT = Number.parseInt(process.env.NAUTILUS_PORT || '3333', 10);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createNautilusServer() {
  const app = express();
  const agent = new Agent(MODEL, { ollamaHost: OLLAMA_HOST });
  const lastAutomationReports = new Map();
  let activeChat = false;

  startAutomationScheduler(agent, { projectRoot: PROJECT_ROOT });

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/status', async (request, response) => {
    try {
      const ollama = await agent.checkOllamaConnection();
      response.json({
        ok: true,
        model: MODEL,
        ollamaHost: agent.ollamaHost,
        hasModel: ollama.hasModel,
        toolCount: availableTools.length
      });
    } catch (error) {
      response.status(503).json({
        ok: false,
        model: MODEL,
        ollamaHost: agent.ollamaHost,
        error: agent.formatOllamaError(error)
      });
    }
  });

  app.get('/api/system', async (request, response) => {
    try {
      response.json(await getSystemSnapshot());
    } catch (error) {
      response.status(500).json({
        error: error.message || String(error)
      });
    }
  });

  app.get('/api/radar', (request, response) => {
    try {
      response.json(scanProject({ root: PROJECT_ROOT }));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/automations', (request, response) => {
    try {
      const automations = listAutomations();
      response.json({
        automations,
        recentReports: [...lastAutomationReports.entries()].map(([id, report]) => ({
          id,
          ranAt: report.ranAt,
          preview: report.text.slice(0, 280)
        }))
      });
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/automations/:id', (request, response) => {
    const automation = getAutomation(request.params.id);
    if (!automation) {
      response.status(404).json({ error: 'Automacao nao encontrada.' });
      return;
    }
    response.json({
      automation: listAutomations().find(item => item.id === automation.id),
      lastReport: lastAutomationReports.get(automation.id) || null
    });
  });

  app.post('/api/automations/run-due', async (request, response) => {
    try {
      const reports = await runDueAutomations({ ledger: agent.ledger, projectRoot: PROJECT_ROOT });
      for (const report of reports) lastAutomationReports.set(report.id, report);
      response.json({ count: reports.length, reports });
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/automations/:id/run', async (request, response) => {
    try {
      const report = await runAutomation(request.params.id, {
        ledger: agent.ledger,
        projectRoot: PROJECT_ROOT
      });
      lastAutomationReports.set(report.id, report);
      response.json({ report });
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/memories', async (request, response) => {
    try {
      response.json(await listMemories());
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/memories', async (request, response) => {
    try {
      const text = String(request.body?.text || '').trim();
      if (!text) {
        response.status(400).json({ error: 'Texto obrigatorio.' });
        return;
      }
      const memory = await saveMemory(text, {
        tags: request.body?.tags || [],
        pinned: Boolean(request.body?.pinned)
      });
      response.json(memory);
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.put('/api/memories/:id', async (request, response) => {
    try {
      const memory = await updateMemory(request.params.id, {
        text: request.body?.text,
        tags: request.body?.tags,
        pinned: request.body?.pinned
      });
      response.json(memory);
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.delete('/api/memories/:id', async (request, response) => {
    try {
      await deleteMemory(request.params.id);
      response.json({ ok: true });
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/memories/:id/history', (request, response) => {
    try {
      response.json(agent.ledger.listMemoryUsage(request.params.id));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/projects', (request, response) => {
    try {
      response.json(listProjects());
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/projects', (request, response) => {
    try {
      const name = String(request.body?.name || '').trim();
      if (!name) {
        response.status(400).json({ error: 'Nome obrigatorio.' });
        return;
      }
      response.json(createProject(name, request.body?.description || '', request.body?.status || 'Planos'));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/projects/:id', (request, response) => {
    try {
      const project = getProject(request.params.id);
      if (!project) {
        response.status(404).json({ error: 'Projeto nao encontrado.' });
        return;
      }
      response.json(project);
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/projects/:id/history', (request, response) => {
    try {
      response.json(listHistory('project', request.params.id));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.put('/api/projects/:id', (request, response) => {
    try {
      response.json(updateProject(request.params.id, request.body || {}));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.delete('/api/projects/:id', (request, response) => {
    try {
      response.json({ ok: true, project: deleteProject(request.params.id) });
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/projects/:id/notes', (request, response) => {
    try {
      const content = String(request.body?.content || '').trim();
      if (!content) {
        response.status(400).json({ error: 'Conteudo obrigatorio.' });
        return;
      }
      response.json(addProjectNote(request.params.id, content));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.delete('/api/projects/notes/:noteId', (request, response) => {
    try {
      response.json({ ok: true, note: deleteProjectNote(request.params.noteId) });
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/tasks', (request, response) => {
    try {
      response.json(
        listTasks({
          projectId: request.query.projectId || null,
          status: request.query.status !== 'all' ? request.query.status : null,
          priority: request.query.priority !== 'all' ? request.query.priority : null,
          search: request.query.search || null
        })
      );
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/tasks', (request, response) => {
    try {
      const title = String(request.body?.title || '').trim();
      if (!title) {
        response.status(400).json({ error: 'Titulo obrigatorio.' });
        return;
      }
      response.json(
        createTask({
          title,
          description: request.body?.description || '',
          projectId: request.body?.projectId || null,
          scheduledDate: request.body?.scheduledDate || null,
          dueDate: request.body?.dueDate || null,
          priority: request.body?.priority || 'media',
          status: request.body?.status || 'Planos'
        })
      );
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/tasks/:id', (request, response) => {
    try {
      const task = getTask(request.params.id);
      if (!task) {
        response.status(404).json({ error: 'Tarefa nao encontrada.' });
        return;
      }
      response.json(task);
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/tasks/:id/history', (request, response) => {
    try {
      response.json(listHistory('task', request.params.id));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.put('/api/tasks/:id', (request, response) => {
    try {
      response.json(updateTask(request.params.id, request.body || {}));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.delete('/api/tasks/:id', (request, response) => {
    try {
      response.json({ ok: true, task: deleteTask(request.params.id) });
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.post('/api/tasks/:id/subtasks', (request, response) => {
    try {
      const title = String(request.body?.title || '').trim();
      if (!title) {
        response.status(400).json({ error: 'Titulo obrigatorio.' });
        return;
      }
      response.json(createSubtask(request.params.id, title, request.body?.status || 'pendente'));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.put('/api/tasks/subtasks/:subtaskId', (request, response) => {
    try {
      response.json(updateSubtask(request.params.subtaskId, request.body?.status || 'pendente'));
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.delete('/api/tasks/subtasks/:subtaskId', (request, response) => {
    try {
      response.json({ ok: true, subtask: deleteSubtask(request.params.subtaskId) });
    } catch (error) {
      response.status(500).json({ error: error.message || String(error) });
    }
  });

  app.get('/api/observatory', (request, response) => {
    try {
      response.json({
        stats: agent.ledger.getStats(),
        recentRuns: agent.ledger.listRuns({ limit: 12 }),
        council: {
          enabled: true,
          primaryModel: agent.modelName,
          peerModel: agent.peerModelName
        },
        agentTeam: {
          enabled: true,
          agents: AGENT_TEAM.map(item => ({
            id: item.id,
            name: item.name,
            shortName: item.shortName,
            specialty: item.specialty
          })),
          decisionAgent: DECISION_AGENT
        },
        decisionRoom: {
          enabled: true,
          agents: DECISION_ROOM_AGENTS.map(item => ({
            id: item.id,
            shortName: item.shortName,
            specialty: item.specialty
          }))
        },
        radar: scanProject({ root: PROJECT_ROOT })
      });
    } catch (error) {
      response.status(500).json({
        error: error.message || String(error)
      });
    }
  });

  app.get('/api/runs', (request, response) => {
    try {
      const limit = Number.parseInt(request.query.limit || '30', 10);
      response.json({
        runs: agent.ledger.listRuns({ limit })
      });
    } catch (error) {
      response.status(500).json({
        error: error.message || String(error)
      });
    }
  });

  app.get('/api/runs/:id', (request, response) => {
    try {
      const run = agent.ledger.getRun(request.params.id);
      if (!run) {
        response.status(404).json({ error: 'Run nao encontrado.' });
        return;
      }
      response.json({ run });
    } catch (error) {
      response.status(500).json({
        error: error.message || String(error)
      });
    }
  });

  app.post('/api/chat', async (request, response) => {
    const message = String(request.body?.message || '').trim();
    const mode = String(request.body?.mode || (request.body?.council === true ? 'council' : 'direct')).trim();
    if (!message) {
      response.status(400).json({ error: 'Mensagem vazia.' });
      return;
    }

    if (activeChat) {
      response.status(429).json({
        error: 'Nautilus ja esta processando um comando. Aguarde a execucao atual terminar.'
      });
      return;
    }

    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    activeChat = true;
    try {
      const writeSse = payload => response.write(`data: ${JSON.stringify(payload)}\n\n`);
      const writeToken = token => writeSse({ token });
      const writeEvent = event => {
        if (event) writeSse({ event });
      };

      if (mode === 'decision_room') {
        await agent.decisionRoomChat(message, writeToken, writeEvent);
      } else if (mode === 'team') {
        await agent.teamChat(message, writeToken, writeEvent);
      } else if (mode === 'council') {
        await agent.councilChat(message, writeToken, writeEvent);
      } else {
        await agent.chat(message, writeToken, writeEvent);
      }
      response.write('data: [DONE]\n\n');
      response.end();
    } catch (error) {
      response.write(`data: ${JSON.stringify({ error: error.message || String(error) })}\n\n`);
      response.end();
    } finally {
      activeChat = false;
    }
  });

  return { app, agent, lastAutomationReports };
}

export function startNautilusServer(port = PORT) {
  const { app } = createNautilusServer();
  const server = app.listen(port, () => {
    console.log(`Nautilus API online em http://127.0.0.1:${port}`);
    console.log(`Modelo: ${MODEL}`);
  });

  server.on('error', error => {
    console.error(`Erro ao iniciar API Nautilus: ${error.message}`);
    process.exitCode = 1;
  });

  return server;
}

const currentFile = fileURLToPath(import.meta.url);
const executedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (executedFile && currentFile === executedFile) {
  startNautilusServer();
}
