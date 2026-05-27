import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('registra run, eventos, tool call, memoria e safe mode no ledger', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nautilus-ledger-'));
  const dbPath = path.join(tempDir, 'ledger.sqlite');
  const { AgentLedger } = await import('../src/core/AgentLedger.js');
  const ledger = new AgentLedger({ dbPath });

  const run = ledger.startRun({
    userInput: 'analise o sistema',
    model: 'local-model',
    ollamaHost: 'http://127.0.0.1:11434',
    mode: 'agent'
  });

  ledger.recordEvent(run.id, 'custom_event', {
    title: 'Evento customizado',
    summary: 'Teste do ledger'
  });

  const toolCall = ledger.startToolCall(run.id, 'get_system_status', {});
  ledger.finishToolCall(toolCall.id, {
    status: 'completed',
    result: { finalAnswer: 'CPU: 10%' }
  });

  ledger.recordMemoryHits(run.id, [
    {
      id: 'mem-1',
      text: 'meus contratos ficam em D:\\Clientes',
      tags: ['contratos'],
      similarity: 0.82
    }
  ]);

  ledger.recordSafeModeEvent(
    run.id,
    {
      safeMode: {
        summary: 'apagar arquivo',
        targets: ['danger.txt'],
        risk: 'perda de dados',
        confirmationPhrase: 'SIM, APAGAR'
      }
    },
    'manage_files'
  );

  ledger.finishRun(run.id, {
    status: 'completed',
    finalAnswer: 'Sistema analisado.'
  });

  const stored = ledger.getRun(run.id);
  assert.equal(stored.id, run.id);
  assert.equal(stored.status, 'completed');
  assert.equal(stored.toolCalls.length, 1);
  assert.equal(stored.memoryHits.length, 1);
  assert.equal(stored.safeModeEvents.length, 1);
  assert.ok(stored.events.some(event => event.eventType === 'custom_event'));

  const stats = ledger.getStats();
  assert.equal(stats.totalRuns, 1);
  assert.equal(stats.safeModeBlocks, 1);
  assert.equal(stats.memoryHits, 1);
  assert.equal(stats.topTools[0].toolName, 'get_system_status');
});
