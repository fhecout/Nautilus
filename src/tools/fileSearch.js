import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cleanText, getFileInfo, isLikelyTextFile, resolveLocalPath } from './localPaths.js';

const DEFAULT_ROOTS = ['Desktop', 'Documents', 'Downloads', 'Pictures'].map(name =>
  path.join(os.homedir(), name)
);
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.secrets',
  'AppData',
  'Windows',
  'Program Files',
  'Program Files (x86)',
  '$Recycle.Bin',
  '.next',
  '.nuxt',
  '.turbo',
  '.gradle',
  'venv',
  'env',
  '.venv',
  'dist',
  'build',
  'target',
  'out',
  '__pycache__'
]);
const MAX_SCAN = 25000;
const MAX_RESULTS = 50;
const MAX_CONTENT_CHARS = 12000;

export const definition = {
  type: 'function',
  function: {
    name: 'find_local_files',
    description:
      'Busca arquivos e pastas no PC por nome, extensao e opcionalmente conteudo. Use quando o usuario pedir para encontrar arquivos no computador, navegar por pastas ou localizar documentos/imagens/bancos.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Texto para procurar no nome do arquivo/pasta ou no conteudo.'
        },
        root: {
          type: 'string',
          description:
            'Pasta inicial. Se omitida, busca em Desktop, Documents, Downloads e Pictures do usuario.'
        },
        extensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Extensoes desejadas, exemplo: [".pdf", ".txt", ".db", ".jpg"].'
        },
        includeContent: {
          type: 'boolean',
          description: 'Quando true, procura tambem dentro de arquivos de texto.'
        },
        maxDepth: {
          type: 'integer',
          description: 'Profundidade maxima de subdiretorios para buscar (ex: 1 para apenas o diretorio raiz, 3 para buscas medianas). Padrao: 3.'
        },
        maxResults: {
          type: 'integer',
          description: 'Maximo de resultados. Padrao: 20, limite 50.'
        }
      },
      required: ['query']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const query = cleanText(input.query).toLowerCase();
  if (!query) throw new Error('Query de busca nao informada.');

  const roots = input.root ? [resolveLocalPath(input.root)] : DEFAULT_ROOTS;
  const extensions = normalizeExtensions(input.extensions);
  const includeContent = Boolean(input.includeContent);
  const maxDepth = clampInteger(input.maxDepth ?? 3, 1, 10);
  const maxResults = clampInteger(input.maxResults ?? 20, 1, MAX_RESULTS);
  const results = [];
  let scanned = 0;

  for (const root of roots) {
    await walk(root, 0);
    if (results.length >= maxResults || scanned >= MAX_SCAN) break;
  }

  const finalAnswer = formatResults({ query, roots, results, scanned });
  return {
    directReturn: true,
    finalAnswer,
    results,
    scanned
  };

  async function walk(currentPath, currentDepth) {
    if (results.length >= maxResults || scanned >= MAX_SCAN) return;
    if (currentDepth > maxDepth) return;

    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults || scanned >= MAX_SCAN) return;
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentPath, entry.name);
      scanned += 1;

      if (entry.isDirectory()) {
        if (entry.name.toLowerCase().includes(query)) {
          results.push(await toResult(fullPath, 'nome da pasta'));
        }
        await walk(fullPath, currentDepth + 1);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.length > 0 && !extensions.includes(ext)) continue;

      const nameMatches = entry.name.toLowerCase().includes(query);
      let contentMatches = false;
      let preview = '';

      if (!nameMatches && includeContent && isLikelyTextFile(fullPath)) {
        try {
          const text = await fs.readFile(fullPath, 'utf8');
          const index = text.toLowerCase().indexOf(query);
          if (index !== -1) {
            contentMatches = true;
            preview = cleanText(text.slice(Math.max(0, index - 120), index + MAX_CONTENT_CHARS));
          }
        } catch {
          // Ignore unreadable text files.
        }
      }

      if (nameMatches || contentMatches) {
        results.push(await toResult(fullPath, nameMatches ? 'nome do arquivo' : 'conteudo', preview));
      }
    }
  }
}

async function toResult(filePath, matchType, preview = '') {
  const info = await getFileInfo(filePath);
  return {
    path: filePath,
    name: info.name,
    extension: info.extension,
    isDirectory: info.isDirectory,
    sizeBytes: info.sizeBytes,
    modifiedAt: info.modifiedAt,
    matchType,
    preview
  };
}

function formatResults({ query, roots, results, scanned }) {
  if (results.length === 0) {
    return [
      `Nao encontrei arquivos para: ${query}`,
      `Pastas buscadas: ${roots.join('; ')}`,
      `Itens analisados: ${scanned}`
    ].join('\n');
  }

  const lines = [
    `Encontrei ${results.length} resultado(s) para: ${query}`,
    `Itens analisados: ${scanned}`,
    ''
  ];

  for (const [index, result] of results.entries()) {
    lines.push(
      [
        `${index + 1}. ${result.name}`,
        `   Caminho: ${result.path}`,
        `   Tipo: ${result.isDirectory ? 'pasta' : result.extension || 'arquivo'} | Match: ${result.matchType}`,
        `   Modificado: ${result.modifiedAt}`,
        result.preview ? `   Trecho: ${result.preview}` : null
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  return lines.join('\n');
}

function normalizeExtensions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .map(item => (item.startsWith('.') ? item : `.${item}`));
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return { query: args };
    }
  }

  return args && typeof args === 'object' ? args : {};
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}

