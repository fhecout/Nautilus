import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_LEDGER_DB_PATH = path.resolve(process.cwd(), 'data', 'agent-ledger.sqlite');
const MAX_TEXT = 12000;
const SECRET_KEY_PATTERN = /(token|secret|password|senha|client_secret|api[_-]?key|authorization|cookie)/i;

export class AgentLedger {
  constructor(options = {}) {
    this.dbPath = options.dbPath || process.env.LEDGER_DB_PATH || DEFAULT_LEDGER_DB_PATH;
    this.db = null;
  }

  startRun({ userInput, model, ollamaHost, mode = 'agent' }) {
    const db = this.getDb();
    const id = randomUUID();
    const startedAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO agent_runs (id, started_at, status, mode, user_input, model, ollama_host)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, startedAt, 'running', mode, limitText(userInput), model || null, ollamaHost || null);

    this.recordEvent(id, 'run_started', {
      title: 'Execucao iniciada',
      summary: mode === 'council' ? 'Council mode ativado para decisao assistida.' : 'Agente iniciou uma nova execucao.',
      userInput: limitText(userInput, 1000)
    });

    return { id, startedAt, mode };
  }

  finishRun(id, { status = 'completed', finalAnswer = '', error = null } = {}) {
    const db = this.getDb();
    const endedAt = new Date().toISOString();
    const row = db.prepare('SELECT started_at FROM agent_runs WHERE id = ?').get(id);
    const elapsedMs = row?.started_at ? Date.parse(endedAt) - Date.parse(row.started_at) : null;

    db.prepare(`
      UPDATE agent_runs
      SET ended_at = ?, status = ?, final_answer = ?, error = ?, elapsed_ms = ?
      WHERE id = ?
    `).run(endedAt, status, limitText(finalAnswer), error ? limitText(error, 2000) : null, elapsedMs, id);

    this.recordEvent(id, status === 'completed' ? 'run_finished' : 'run_failed', {
      title: status === 'completed' ? 'Execucao concluida' : 'Execucao com falha',
      summary: status === 'completed' ? `Finalizada em ${elapsedMs || 0}ms.` : error,
      elapsedMs
    });
  }

  startToolCall(runId, toolName, args) {
    const db = this.getDb();
    const id = randomUUID();
    const startedAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO tool_calls (id, run_id, tool_name, started_at, status, args_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, runId, toolName, startedAt, 'running', toJson(redact(args)));

    const event = this.recordEvent(runId, 'tool_call_started', {
      title: `Tool iniciada: ${toolName}`,
      summary: summarizeArgs(args),
      toolCallId: id,
      toolName
    });

    return { id, startedAt, toolName, event };
  }

  finishToolCall(toolCallId, { status = 'completed', result = null, error = null } = {}) {
    const db = this.getDb();
    const endedAt = new Date().toISOString();
    const row = db.prepare('SELECT run_id, tool_name, started_at FROM tool_calls WHERE id = ?').get(toolCallId);
    const elapsedMs = row?.started_at ? Date.parse(endedAt) - Date.parse(row.started_at) : null;
    const resultSummary = error ? limitText(error, 2000) : summarizeResult(result);

    db.prepare(`
      UPDATE tool_calls
      SET ended_at = ?, status = ?, result_summary = ?, error = ?, elapsed_ms = ?
      WHERE id = ?
    `).run(endedAt, status, resultSummary, error ? limitText(error, 2000) : null, elapsedMs, toolCallId);

    if (row?.run_id) {
      return this.recordEvent(row.run_id, status === 'completed' ? 'tool_call_finished' : 'tool_call_failed', {
        title: status === 'completed' ? `Tool concluida: ${row.tool_name}` : `Tool falhou: ${row.tool_name}`,
        summary: resultSummary,
        toolCallId,
        toolName: row.tool_name,
        elapsedMs
      });
    }

    return null;
  }

  recordMemoryHits(runId, memories = []) {
    if (!runId || !Array.isArray(memories) || memories.length === 0) return;
    const db = this.getDb();
    const stmt = db.prepare(`
      INSERT INTO memory_hits (id, run_id, memory_id, text, tags_json, similarity, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const memory of memories.slice(0, 12)) {
      stmt.run(
        randomUUID(),
        runId,
        memory.id || null,
        limitText(memory.text, 2000),
        toJson(memory.tags || []),
        Number.isFinite(memory.similarity) ? memory.similarity : null,
        new Date().toISOString()
      );
    }

    this.recordEvent(runId, 'memory_hits', {
      title: 'Memorias consultadas',
      summary: `${memories.length} memoria(s) relevante(s) encontrada(s).`,
      count: memories.length,
      memories: memories.slice(0, 6).map(memory => ({
        id: memory.id,
        text: limitText(memory.text, 240),
        tags: memory.tags || [],
        similarity: memory.similarity ?? null
      }))
    });
  }

  recordSafeModeEvent(runId, result, toolName = null) {
    if (!runId || !result?.safeMode) return;
    const db = this.getDb();
    const event = result.safeMode;

    db.prepare(`
      INSERT INTO safe_mode_events (id, run_id, tool_name, summary, targets_json, risk, confirmation_phrase, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      runId,
      toolName,
      limitText(event.summary, 2000),
      toJson(event.targets || []),
      limitText(event.risk, 2000),
      event.confirmationPhrase || null,
      new Date().toISOString()
    );

    this.recordEvent(runId, 'safe_mode_blocked', {
      title: 'Safe Mode bloqueou uma acao',
      summary: event.summary,
      toolName,
      targets: event.targets || [],
      risk: event.risk,
      confirmationPhrase: event.confirmationPhrase
    });
  }

  recordEvent(runId, eventType, payload = {}) {
    if (!runId) return null;
    const db = this.getDb();
    const createdAt = new Date().toISOString();
    const title = payload.title || eventType;
    const summary = payload.summary || '';

    const info = db.prepare(`
      INSERT INTO agent_events (run_id, event_type, created_at, title, summary, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(runId, eventType, createdAt, limitText(title, 240), limitText(summary, 2000), toJson(redact(payload)));

    return {
      id: Number(info.lastInsertRowid),
      runId,
      eventType,
      createdAt,
      title: limitText(title, 240),
      summary: limitText(summary, 2000),
      payload: redact(payload)
    };
  }

  listRuns({ limit = 20 } = {}) {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT
        r.*,
        (SELECT COUNT(*) FROM tool_calls t WHERE t.run_id = r.id) AS tool_count,
        (SELECT COUNT(*) FROM safe_mode_events s WHERE s.run_id = r.id) AS safe_mode_count,
        (SELECT COUNT(*) FROM memory_hits m WHERE m.run_id = r.id) AS memory_hit_count
      FROM agent_runs r
      ORDER BY r.started_at DESC
      LIMIT ?
    `).all(clampInteger(limit, 1, 100));

    return rows.map(row => ({
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      mode: row.mode,
      userInput: row.user_input,
      finalAnswer: row.final_answer,
      model: row.model,
      elapsedMs: row.elapsed_ms,
      error: row.error,
      toolCount: row.tool_count,
      safeModeCount: row.safe_mode_count,
      memoryHitCount: row.memory_hit_count
    }));
  }

  getRun(id) {
    const db = this.getDb();
    const run = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id);
    if (!run) return null;

    const events = db.prepare(`
      SELECT * FROM agent_events WHERE run_id = ? ORDER BY id ASC
    `).all(id).map(formatEventRow);

    const toolCalls = db.prepare(`
      SELECT * FROM tool_calls WHERE run_id = ? ORDER BY started_at ASC
    `).all(id).map(row => ({
      id: row.id,
      toolName: row.tool_name,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      args: parseJson(row.args_json, {}),
      resultSummary: row.result_summary,
      error: row.error,
      elapsedMs: row.elapsed_ms
    }));

    const safeModeEvents = db.prepare(`
      SELECT * FROM safe_mode_events WHERE run_id = ? ORDER BY created_at ASC
    `).all(id).map(row => ({
      id: row.id,
      toolName: row.tool_name,
      summary: row.summary,
      targets: parseJson(row.targets_json, []),
      risk: row.risk,
      confirmationPhrase: row.confirmation_phrase,
      createdAt: row.created_at
    }));

    const memoryHits = db.prepare(`
      SELECT * FROM memory_hits WHERE run_id = ? ORDER BY created_at ASC
    `).all(id).map(row => ({
      id: row.id,
      memoryId: row.memory_id,
      text: row.text,
      tags: parseJson(row.tags_json, []),
      similarity: row.similarity,
      createdAt: row.created_at
    }));

    return {
      id: run.id,
      startedAt: run.started_at,
      endedAt: run.ended_at,
      status: run.status,
      mode: run.mode,
      userInput: run.user_input,
      finalAnswer: run.final_answer,
      model: run.model,
      ollamaHost: run.ollama_host,
      elapsedMs: run.elapsed_ms,
      error: run.error,
      events,
      toolCalls,
      safeModeEvents,
      memoryHits
    };
  }

  listMemoryUsage(memoryId, limit = 20) {
    const db = this.getDb();
    return db.prepare(`
      SELECT mh.similarity, mh.text, mh.created_at, r.user_input, r.started_at
      FROM memory_hits mh
      JOIN agent_runs r ON r.id = mh.run_id
      WHERE mh.memory_id = ?
      ORDER BY mh.created_at DESC
      LIMIT ?
    `).all(memoryId, limit);
  }

  getStats() {
    const db = this.getDb();
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total_runs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_runs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_runs,
        AVG(elapsed_ms) AS avg_elapsed_ms
      FROM agent_runs
    `).get();

    const tools = db.prepare(`
      SELECT tool_name, COUNT(*) AS count, AVG(elapsed_ms) AS avg_elapsed_ms
      FROM tool_calls
      GROUP BY tool_name
      ORDER BY count DESC
      LIMIT 8
    `).all();

    const safeMode = db.prepare('SELECT COUNT(*) AS count FROM safe_mode_events').get();
    const memories = db.prepare('SELECT COUNT(*) AS count FROM memory_hits').get();

    return {
      totalRuns: totals.total_runs || 0,
      completedRuns: totals.completed_runs || 0,
      failedRuns: totals.failed_runs || 0,
      avgElapsedMs: Math.round(Number(totals.avg_elapsed_ms || 0)),
      safeModeBlocks: safeMode.count || 0,
      memoryHits: memories.count || 0,
      topTools: tools.map(row => ({
        toolName: row.tool_name,
        count: row.count,
        avgElapsedMs: Math.round(Number(row.avg_elapsed_ms || 0))
      }))
    };
  }

  getDb() {
    if (this.db) return this.db;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'agent',
        user_input TEXT NOT NULL,
        final_answer TEXT,
        model TEXT,
        ollama_host TEXT,
        error TEXT,
        elapsed_ms INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        title TEXT,
        summary TEXT,
        payload_json TEXT,
        FOREIGN KEY (run_id) REFERENCES agent_runs(id)
      );

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        args_json TEXT,
        result_summary TEXT,
        error TEXT,
        elapsed_ms INTEGER,
        FOREIGN KEY (run_id) REFERENCES agent_runs(id)
      );

      CREATE TABLE IF NOT EXISTS safe_mode_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        tool_name TEXT,
        summary TEXT,
        targets_json TEXT,
        risk TEXT,
        confirmation_phrase TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES agent_runs(id)
      );

      CREATE TABLE IF NOT EXISTS memory_hits (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        memory_id TEXT,
        text TEXT,
        tags_json TEXT,
        similarity REAL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES agent_runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_events_run_id ON agent_events(run_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_run_id ON tool_calls(run_id);
      CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs(started_at);
    `);
    return this.db;
  }
}

function formatEventRow(row) {
  return {
    id: row.id,
    runId: row.run_id,
    eventType: row.event_type,
    createdAt: row.created_at,
    title: row.title,
    summary: row.summary,
    payload: parseJson(row.payload_json, {})
  };
}

function summarizeArgs(args) {
  const value = redact(args);
  if (!value || typeof value !== 'object') return limitText(String(value || ''), 400);
  const keys = Object.keys(value).slice(0, 6);
  if (keys.length === 0) return 'Sem argumentos.';
  return keys.map(key => `${key}=${limitText(JSON.stringify(value[key]), 80)}`).join(' | ');
}

function summarizeResult(result) {
  if (!result) return 'Sem resultado.';
  if (typeof result.finalAnswer === 'string') return limitText(result.finalAnswer, 2000);
  if (typeof result.modelInput === 'string') return limitText(result.modelInput, 2000);
  return limitText(JSON.stringify(redact(result)), 2000);
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[redacted]' : redact(item)
    ])
  );
}

function toJson(value) {
  return limitText(JSON.stringify(value ?? null), MAX_TEXT);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function limitText(value, max = MAX_TEXT) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}
