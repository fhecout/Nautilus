import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Ollama } from 'ollama';

const DEFAULT_MEMORY_DB_PATH = path.resolve(process.cwd(), 'data', 'memory.sqlite');
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'nomic-embed-text';

const ollama = new Ollama({ host: OLLAMA_HOST });
let dbInstance = null;

export function getMemoryDbPath() {
  return process.env.MEMORY_DB_PATH || DEFAULT_MEMORY_DB_PATH;
}

function getDb() {
  if (dbInstance) return dbInstance;
  const dbPath = getMemoryDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  dbInstance = new DatabaseSync(dbPath);

  // Inicializa a tabela principal
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      tags TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  // Verifica se a coluna de embedding existe, adiciona se faltar (migração simples)
  const pragma = dbInstance.prepare("PRAGMA table_info(memories)").all();
  const hasEmbedding = pragma.some(col => col.name === 'embedding');
  if (!hasEmbedding) {
    dbInstance.exec("ALTER TABLE memories ADD COLUMN embedding TEXT");
  }

  return dbInstance;
}

async function getEmbedding(text) {
  try {
    const response = await ollama.embeddings({
      model: EMBEDDING_MODEL,
      prompt: text
    });
    return response.embedding;
  } catch (error) {
    console.error(`[Memory Embeddings] Erro ao obter embedding com Ollama: ${error.message}`);
    return null;
  }
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function saveMemory(text, options = {}) {
  const db = getDb();
  const id = options.id || randomUUID();
  const normalizedText = normalizeText(text);
  const tags = normalizeTags(options.tags || extractTags(text));
  const created_at = options.created_at || new Date().toISOString();

  if (!normalizedText) {
    throw new Error('Texto da memoria nao informado.');
  }

  const embeddingVector = await getEmbedding(normalizedText);
  const embeddingJson = embeddingVector ? JSON.stringify(embeddingVector) : null;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO memories (id, text, tags, embedding, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, normalizedText, JSON.stringify(tags), embeddingJson, created_at);

  return {
    id,
    text: normalizedText,
    tags,
    embedding: embeddingVector,
    created_at
  };
}

export async function searchMemories(keyword, options = {}) {
  const query = normalizeText(keyword);
  if (!query) return [];

  const limit = clampInteger(options.limit ?? 8, 1, 50);
  const db = getDb();
  const like = `%${query.toLowerCase()}%`;

  const stmt = db.prepare(`
    SELECT id, text, tags, created_at FROM memories
    WHERE lower(text) LIKE ? OR lower(tags) LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(like, like, limit);
  return rows.map(row => ({
    id: row.id,
    text: row.text,
    tags: JSON.parse(row.tags || '[]'),
    created_at: row.created_at
  }));
}

export async function listMemories(options = {}) {
  const limit = clampInteger(options.limit ?? 30, 1, 100);
  const db = getDb();

  const stmt = db.prepare(`
    SELECT id, text, tags, created_at FROM memories
    ORDER BY created_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit);
  return rows.map(row => ({
    id: row.id,
    text: row.text,
    tags: JSON.parse(row.tags || '[]'),
    created_at: row.created_at
  }));
}

export async function deleteMemory(identifier) {
  const value = normalizeText(identifier);
  if (!value) {
    throw new Error('Informe o id ou texto da memoria a apagar.');
  }

  const db = getDb();
  const lowerVal = `%${value.toLowerCase()}%`;

  const selectStmt = db.prepare(`
    SELECT id, text, tags, created_at FROM memories
    WHERE id = ? OR lower(text) LIKE ? OR lower(tags) LIKE ?
  `);
  const rows = selectStmt.all(value, lowerVal, lowerVal);
  const deleted = rows.map(row => ({
    id: row.id,
    text: row.text,
    tags: JSON.parse(row.tags || '[]'),
    created_at: row.created_at
  }));

  const deleteStmt = db.prepare("DELETE FROM memories WHERE id = ?");
  for (const row of deleted) {
    deleteStmt.run(row.id);
  }

  return deleted;
}

export async function findRelevantMemories(userInput, options = {}) {
  const limit = options.limit ?? 6;
  const db = getDb();

  // 1. Tenta buscar similaridade semântica por embeddings
  const queryVector = await getEmbedding(userInput);
  if (queryVector) {
    const stmt = db.prepare("SELECT id, text, tags, embedding, created_at FROM memories WHERE embedding IS NOT NULL");
    const rows = stmt.all();

    const scored = rows.map(row => {
      const tags = JSON.parse(row.tags || '[]');
      const embedding = JSON.parse(row.embedding);
      const similarity = cosineSimilarity(queryVector, embedding);
      return {
        id: row.id,
        text: row.text,
        tags,
        created_at: row.created_at,
        similarity
      };
    });

    // Ordena por maior similaridade e filtra por limiar aceitável (ex: 0.35)
    scored.sort((a, b) => b.similarity - a.similarity);
    const semanticResults = scored.filter(item => item.similarity >= 0.35).slice(0, limit);

    if (semanticResults.length > 0) {
      return semanticResults;
    }
  }

  // 2. Fallback de busca tradicional por palavra-chave se embeddings falharem ou não houver correspondência semântica
  const keywords = extractSearchTerms(userInput).slice(0, 5);
  const seen = new Set();
  const memories = [];

  for (const keyword of keywords) {
    const found = await searchMemories(keyword, { limit: 5 });
    for (const memory of found) {
      if (!seen.has(memory.id)) {
        seen.add(memory.id);
        memories.push(memory);
      }
    }
  }

  return memories.slice(0, limit);
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
