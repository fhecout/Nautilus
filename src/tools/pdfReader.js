import { PDFParse } from 'pdf-parse';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const MAX_PAGES = 30;
const MAX_TEXT_CHARS = 45000;
const MAX_MODEL_CHARS = 12000;
const MAX_SEARCH_FILES = 2000;

export const definition = {
  type: 'function',
  function: {
    name: 'read_pdf',
    description:
      'Localiza e le um PDF local ou URL de PDF, extrai texto, busca trechos relevantes e entrega conteudo para resumo, traducao para portugues ou resposta a perguntas sobre o PDF.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description:
            'Caminho completo, URL ou nome/trecho do nome do PDF. Exemplo: C:\\Users\\Ana\\Downloads\\relatorio.pdf, bitcoin.pdf, relatorio anual.'
        },
        question: {
          type: 'string',
          description:
            'O que o usuario quer saber sobre o PDF. Se vazio, a tool prepara um resumo geral.'
        },
        maxPages: {
          type: 'integer',
          description: 'Numero maximo de paginas para ler. Limite seguro: 1 a 30. Padrao: 30.'
        }
      },
      required: ['source']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const source = normalizeSource(input.source);
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  const maxPages = clampInteger(input.maxPages ?? MAX_PAGES, 1, MAX_PAGES);

  const resolved = await resolvePdfSource(source);
  const startedAt = Date.now();
  const parsed = await parsePdf(resolved, maxPages);
  const relevantText = findRelevantText(parsed.text, question);
  const modelInput = buildModelInput({
    source,
    resolved,
    parsed,
    question,
    relevantText,
    elapsedMs: Date.now() - startedAt
  });

  return {
    directReturn: false,
    modelInput,
    finalAnswer: modelInput,
    query: {
      source,
      question: question || null,
      maxPages
    },
    document: {
      sourceType: resolved.type,
      path: resolved.path || null,
      url: resolved.url || null,
      fileName: resolved.fileName,
      pages: parsed.pages,
      textChars: parsed.text.length,
      info: parsed.info
    },
    relevantText,
    elapsedMs: Date.now() - startedAt
  };
}

async function parsePdf(resolved, maxPages) {
  const loadParams =
    resolved.type === 'url'
      ? { url: resolved.url }
      : { data: await fs.readFile(resolved.path) };

  const parser = new PDFParse(loadParams);

  try {
    const info = await parser.getInfo({ parsePageInfo: false }).catch(() => null);
    const textResult = await parser.getText({ first: maxPages });
    const text = cleanText(textResult.text || '').slice(0, MAX_TEXT_CHARS);

    return {
      pages: info?.total || null,
      info: normalizePdfInfo(info),
      text,
      textPreview: text.slice(0, 2500)
    };
  } finally {
    await parser.destroy();
  }
}

async function resolvePdfSource(source) {
  if (/^https?:\/\//i.test(source)) {
    await assertPublicHttpUrl(source);
    return {
      type: 'url',
      url: source,
      fileName: path.basename(new URL(source).pathname) || 'documento.pdf'
    };
  }

  const expanded = expandHomePath(source);
  const directPath = path.resolve(expanded);

  if (await isReadablePdf(directPath)) {
    return {
      type: 'file',
      path: directPath,
      fileName: path.basename(directPath)
    };
  }

  const found = await findPdfByName(source);
  if (!found) {
    throw new Error(`Nao encontrei PDF correspondente a "${source}". Informe o caminho completo ou coloque o PDF na pasta do projeto, Downloads, Desktop ou Documents.`);
  }

  return {
    type: 'file',
    path: found,
    fileName: path.basename(found)
  };
}

async function findPdfByName(query) {
  const searchRoots = getSearchRoots();
  const normalizedQuery = normalizeForMatch(query).replace(/pdf$/, '').trim();
  const candidates = [];

  for (const root of searchRoots) {
    await walkPdfFiles(root, candidates);
  }

  if (candidates.length === 0) return null;

  const ranked = candidates
    .map(filePath => {
      const base = normalizeForMatch(path.basename(filePath, '.pdf'));
      const score = scoreFileName(base, normalizedQuery);
      return { filePath, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.filePath || null;
}

async function walkPdfFiles(root, output) {
  if (output.length >= MAX_SEARCH_FILES) return;

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (output.length >= MAX_SEARCH_FILES) return;

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) continue;
      await walkPdfFiles(fullPath, output);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      output.push(fullPath);
    }
  }
}

function buildModelInput({ source, resolved, parsed, question, relevantText, elapsedMs }) {
  const relevant = relevantText
    .slice(0, 8)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');

  return [
    'Voce leu um PDF autorizado pelo usuario.',
    'Responda sempre em portugues do Brasil.',
    'Se o PDF estiver em outro idioma, traduza e explique em portugues.',
    'Se o usuario fez uma pergunta especifica, responda essa pergunta primeiro usando o conteudo do PDF.',
    'Se o usuario pediu resumo, faca um resumo claro, profissional e curto.',
    'Nao copie o PDF inteiro. Sintetize.',
    'Se o texto extraido estiver vazio ou ruim, diga que o PDF pode ser escaneado/imagem e que seria necessario OCR.',
    question ? `Pedido do usuario: ${question}` : 'Pedido do usuario: resumir e explicar o PDF.',
    `Fonte informada: ${source}`,
    `PDF resolvido: ${resolved.path || resolved.url}`,
    `Arquivo: ${resolved.fileName}`,
    `Paginas detectadas: ${parsed.pages || 'nao informado'}`,
    `Tempo de leitura: ${elapsedMs}ms`,
    parsed.info ? `Metadados: ${JSON.stringify(parsed.info)}` : null,
    relevant ? `Trechos mais relevantes:\n${relevant}` : null,
    `Texto extraido do PDF:\n${parsed.text.slice(0, MAX_MODEL_CHARS)}`
  ]
    .filter(Boolean)
    .join('\n\n');
}

function findRelevantText(text, question) {
  const cleaned = cleanText(text);
  const chunks = splitIntoChunks(cleaned, 700);
  const keywords = extractKeywords(question);

  if (keywords.length === 0) {
    return chunks.slice(0, 8);
  }

  return chunks
    .map(chunk => ({
      text: chunk,
      score: keywords.reduce((score, keyword) => {
        return normalizeForMatch(chunk).includes(keyword) ? score + 1 : score;
      }, 0)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(item => item.text);
}

function splitIntoChunks(text, maxLength) {
  const paragraphs = text
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map(item => cleanText(item))
    .filter(item => item.length > 40);
  const chunks = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxLength) {
      chunks.push(paragraph);
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxLength) {
      chunks.push(paragraph.slice(index, index + maxLength));
    }
  }

  return chunks;
}

function extractKeywords(question) {
  const stopWords = new Set([
    'sobre',
    'pdf',
    'arquivo',
    'resumo',
    'resuma',
    'leia',
    'ler',
    'qual',
    'quais',
    'quanto',
    'como',
    'onde',
    'para',
    'voce',
    'traga'
  ]);

  return normalizeForMatch(question)
    .split(/[^a-z0-9]+/i)
    .filter(word => word.length >= 4)
    .filter(word => !stopWords.has(word))
    .slice(0, 16);
}

function normalizePdfInfo(info) {
  if (!info?.info) return null;

  return {
    title: info.info.Title || null,
    author: info.info.Author || null,
    subject: info.info.Subject || null,
    creator: info.info.Creator || null,
    producer: info.info.Producer || null,
    creationDate: info.info.CreationDate || null,
    modificationDate: info.info.ModDate || null
  };
}

function getSearchRoots() {
  const home = os.homedir();
  return uniqueExistingPaths([
    process.cwd(),
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'OneDrive', 'Desktop'),
    path.join(home, 'OneDrive', 'Documents')
  ]);
}

function uniqueExistingPaths(paths) {
  return [...new Set(paths.map(item => path.resolve(item)))];
}

function shouldSkipDirectory(name) {
  return ['node_modules', '.git', 'logs', 'dist', 'build', '.next', 'coverage'].includes(
    name.toLowerCase()
  );
}

async function isReadablePdf(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && filePath.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

function scoreFileName(fileName, query) {
  if (!query) return 0;
  if (fileName === query) return 100;
  if (fileName.includes(query)) return 80;

  const terms = query.split(/[^a-z0-9]+/i).filter(Boolean);
  return terms.reduce((score, term) => {
    return fileName.includes(term) ? score + 10 : score;
  }, 0);
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return { source: args };
    }
  }

  return args && typeof args === 'object' ? args : {};
}

function normalizeSource(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('O parametro source e obrigatorio');
  }

  return value.trim().replace(/^["']|["']$/g, '');
}

function expandHomePath(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith(`~${path.sep}`)) return path.join(os.homedir(), value.slice(2));
  return value;
}

async function assertPublicHttpUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Apenas URLs http/https sao permitidas');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Hosts locais ou privados nao sao permitidos em URL de PDF');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Endereco privado bloqueado');
    return;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: false });
  if (addresses.some(entry => isPrivateAddress(entry.address))) {
    throw new Error('O host resolve para endereco privado e foi bloqueado');
  }
}

function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  return true;
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
