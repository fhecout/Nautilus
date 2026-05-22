import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from './core/Agent.js';
import { loadEnvFile } from './core/env.js';
import { getSystemSnapshot } from './core/systemInfo.js';
import { availableTools } from './tools/index.js';

loadEnvFile();

const MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const PORT = Number.parseInt(process.env.NAUTILUS_PORT || '3333', 10);

export function createNautilusServer() {
  const app = express();
  const agent = new Agent(MODEL, { ollamaHost: OLLAMA_HOST });

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

  app.post('/api/chat', async (request, response) => {
    const message = String(request.body?.message || '').trim();
    if (!message) {
      response.status(400).json({ error: 'Mensagem vazia.' });
      return;
    }

    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    try {
      await agent.chat(message, token => {
        response.write(`data: ${JSON.stringify({ token })}\n\n`);
      });
      response.write('data: [DONE]\n\n');
      response.end();
    } catch (error) {
      response.write(`data: ${JSON.stringify({ error: error.message || String(error) })}\n\n`);
      response.end();
    }
  });

  return { app, agent };
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
