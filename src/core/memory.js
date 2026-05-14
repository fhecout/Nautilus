import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const DEFAULT_MEMORY_DB_PATH = path.resolve(process.cwd(), 'data', 'memory.sqlite');

export function getMemoryDbPath() {
  return process.env.MEMORY_DB_PATH || DEFAULT_MEMORY_DB_PATH;
}

export async function saveMemory(text, options = {}) {
  const memory = {
    id: options.id || randomUUID(),
    text: normalizeText(text),
    tags: normalizeTags(options.tags || extractTags(text)),
    created_at: options.created_at || new Date().toISOString()
  };

  if (!memory.text) {
    throw new Error('Texto da memoria nao informado.');
  }

  await runMemorySqlite('save', { memory });
  return memory;
}

export async function searchMemories(keyword, options = {}) {
  const query = normalizeText(keyword);
  if (!query) return [];

  const limit = clampInteger(options.limit ?? 8, 1, 50);
  const result = await runMemorySqlite('search', { query, limit });
  return result.memories || [];
}

export async function listMemories(options = {}) {
  const limit = clampInteger(options.limit ?? 30, 1, 100);
  const result = await runMemorySqlite('list', { limit });
  return result.memories || [];
}

export async function deleteMemory(identifier) {
  const value = normalizeText(identifier);
  if (!value) {
    throw new Error('Informe o id ou texto da memoria a apagar.');
  }

  const result = await runMemorySqlite('delete', { identifier: value });
  return result.deleted || [];
}

export async function findRelevantMemories(userInput, options = {}) {
  const keywords = extractSearchTerms(userInput).slice(0, 5);
  const seen = new Set();
  const memories = [];

  for (const keyword of keywords) {
    const found = await searchMemories(keyword, { limit: options.limit ?? 5 });
    for (const memory of found) {
      if (!seen.has(memory.id)) {
        seen.add(memory.id);
        memories.push(memory);
      }
    }
  }

  return memories.slice(0, options.limit ?? 6);
}

export function extractMemoryText(userInput) {
  const match = normalizeLine(userInput).match(/^(?:lembre|salve|guarde)\s+que\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function extractMemoryDeleteTarget(userInput) {
  const line = normalizeLine(userInput);
  const normalized = normalizeForSearch(line).replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(?:apague|apagar|delete|remova|remover|esqueca)\s+(?:a\s+)?(?:memoria|lembranca)\s*(?:sobre|de|#)?\s*(.+)$/i);
  if (!match) return null;

  const start = normalized.indexOf(match[1]);
  return start >= 0 ? line.slice(start).trim() : match[1].trim();
}

export function isMemoryListRequest(userInput) {
  return /^(?:liste|listar|mostre|mostrar|ver)\s+(?:minhas\s+)?(?:memorias|lembrancas)$/i.test(
    normalizeForSearch(userInput).replace(/\s+/g, ' ').trim()
  );
}

export function isMemorySearchRequest(userInput) {
  return /^(?:busque|buscar|procure|procurar|pesquise|pesquisar)\s+(?:nas\s+)?(?:memorias|lembrancas)\s+(?:por|sobre)?\s+.+$/i.test(
    normalizeForSearch(userInput).replace(/\s+/g, ' ').trim()
  );
}

export function extractMemorySearchKeyword(userInput) {
  const line = normalizeLine(userInput);
  const normalized = normalizeForSearch(line).replace(/\s+/g, ' ').trim();
  const match = normalized.match(/(?:memorias|lembrancas)\s+(?:por|sobre)?\s+(.+)$/i);
  if (!match) return line;

  const start = normalized.indexOf(match[1]);
  return start >= 0 ? line.slice(start).trim() : match[1].trim();
}

export function formatMemories(memories) {
  if (!memories.length) return 'Nenhuma memoria encontrada.';

  return memories
    .map(memory => {
      const tags = Array.isArray(memory.tags) && memory.tags.length ? ` | tags: ${memory.tags.join(', ')}` : '';
      return `- ${memory.id}: ${memory.text}${tags}`;
    })
    .join('\n');
}

async function runMemorySqlite(operation, payload) {
  const script = `
import json
import os
import sqlite3
import sys

db_path = sys.argv[1]
operation = sys.argv[2]
payload = json.loads(sys.argv[3])
os.makedirs(os.path.dirname(db_path), exist_ok=True)
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    conn.execute("""
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        tags TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    """)

    def row_to_memory(row):
        return {
            "id": row["id"],
            "text": row["text"],
            "tags": json.loads(row["tags"] or "[]"),
            "created_at": row["created_at"]
        }

    if operation == "save":
        memory = payload["memory"]
        conn.execute(
            "INSERT OR REPLACE INTO memories (id, text, tags, created_at) VALUES (?, ?, ?, ?)",
            (memory["id"], memory["text"], json.dumps(memory["tags"], ensure_ascii=False), memory["created_at"])
        )
        conn.commit()
        print(json.dumps({"memory": memory}, ensure_ascii=False))
    elif operation == "search":
        query = payload["query"].lower()
        like = "%" + query + "%"
        rows = conn.execute(
            "SELECT id, text, tags, created_at FROM memories WHERE lower(text) LIKE ? OR lower(tags) LIKE ? ORDER BY created_at DESC LIMIT ?",
            (like, like, int(payload["limit"]))
        ).fetchall()
        print(json.dumps({"memories": [row_to_memory(row) for row in rows]}, ensure_ascii=False))
    elif operation == "list":
        rows = conn.execute(
            "SELECT id, text, tags, created_at FROM memories ORDER BY created_at DESC LIMIT ?",
            (int(payload["limit"]),)
        ).fetchall()
        print(json.dumps({"memories": [row_to_memory(row) for row in rows]}, ensure_ascii=False))
    elif operation == "delete":
        identifier = payload["identifier"].lower()
        rows = conn.execute(
            "SELECT id, text, tags, created_at FROM memories WHERE id = ? OR lower(text) LIKE ? OR lower(tags) LIKE ?",
            (payload["identifier"], "%" + identifier + "%", "%" + identifier + "%")
        ).fetchall()
        deleted = [row_to_memory(row) for row in rows]
        for row in rows:
            conn.execute("DELETE FROM memories WHERE id = ?", (row["id"],))
        conn.commit()
        print(json.dumps({"deleted": deleted}, ensure_ascii=False))
    else:
        raise ValueError("operacao invalida")
finally:
    conn.close()
`;

  const { stdout } = await execFileAsync(
    'python',
    ['-c', script, getMemoryDbPath(), operation, JSON.stringify(payload)],
    {
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 5
    }
  );

  return JSON.parse(stdout);
}

function extractTags(text) {
  const normalized = normalizeForSearch(text);
  const stopWords = new Set([
    'meus',
    'minhas',
    'ficam',
    'fica',
    'estao',
    'estao',
    'estão',
    'para',
    'com',
    'que',
    'dos',
    'das',
    'uma',
    'uns',
    'nas',
    'nos',
    'em'
  ]);

  return normalized
    .split(/[^a-z0-9]+/i)
    .filter(word => word.length >= 4 && !stopWords.has(word))
    .slice(0, 8);
}

function extractSearchTerms(value) {
  return normalizeForSearch(value)
    .split(/[^a-z0-9]+/i)
    .filter(word => word.length >= 4)
    .filter(word => !['procure', 'buscar', 'arquivos', 'arquivo', 'sobre', 'minhas', 'meus', 'onde'].includes(word));
}

function normalizeTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).map(normalizeForSearch).filter(Boolean))].slice(0, 12);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeLine(value) {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function normalizeForSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}
