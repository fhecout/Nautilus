import fs from 'node:fs/promises';
import path from 'node:path';

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'scraper-logs.json');
const MAX_LOGS = 50;

export async function appendScraperLog(entry) {
  const logs = await readScraperLogs();
  const nextId = logs.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;

  logs.unshift({
    id: nextId,
    createdAt: new Date().toISOString(),
    ...entry
  });

  await writeScraperLogs(logs.slice(0, MAX_LOGS));
  return nextId;
}

export async function readScraperLogs() {
  try {
    const raw = await fs.readFile(LOG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

export async function getScraperLog(id) {
  const logs = await readScraperLogs();
  return logs.find(log => log.id === id) || null;
}

export async function clearScraperLogs() {
  await writeScraperLogs([]);
}

async function writeScraperLogs(logs) {
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.writeFile(LOG_FILE, `${JSON.stringify(logs, null, 2)}\n`, 'utf8');
}

export function formatScraperLogList(logs) {
  if (logs.length === 0) {
    return 'Nenhum log de scraper ainda.';
  }

  return logs
    .map(log => {
      const title = log.summary?.title || log.pages?.[0]?.title || 'sem titulo';
      const url = log.query?.url || log.pages?.[0]?.url || 'sem url';
      const pageCount = log.pages?.length || 0;
      const created = formatDate(log.createdAt);

      return [
        `#${log.id} | ${created}`,
        `Site: ${title}`,
        `URL: ${url}`,
        `Paginas: ${pageCount} | Erros: ${log.errors?.length || 0}`
      ].join('\n');
    })
    .join('\n\n');
}

export function formatScraperLogDetail(log) {
  if (!log) return 'Log nao encontrado.';

  const lines = [
    `Log #${log.id}`,
    `Data: ${formatDate(log.createdAt)}`,
    `URL inicial: ${log.query?.url || 'sem url'}`,
    log.query?.question ? `Pergunta: ${log.query.question}` : null,
    `Tempo: ${log.elapsedMs || 0}ms`,
    ''
  ].filter(Boolean);

  for (const [index, page] of (log.pages || []).entries()) {
    lines.push(`Pagina ${index + 1}`);
    lines.push(`Titulo: ${page.title || 'sem titulo'}`);
    lines.push(`URL: ${page.url}`);
    lines.push(`Status: ${page.status} | Bytes: ${page.bytesRead} | Truncado: ${page.truncated ? 'sim' : 'nao'}`);
    lines.push(`Contagens: ${formatCounts(page.counts)}`);

    if (page.warnings?.length) {
      lines.push(`Avisos: ${page.warnings.join(' | ')}`);
    }

    appendSection(lines, 'Headings', page.headings);
    appendSection(lines, 'Noticias/itens', page.newsItems);
    appendSection(lines, 'Precos/cotacoes', page.priceCandidates);
    appendSection(lines, 'Trechos relevantes', page.relevantText);
    appendSection(lines, 'Blocos de conteudo', page.contentBlocks);
    appendSection(lines, 'Links extraidos', page.links);
    appendSection(lines, 'Imagens extraidas', page.images);
    appendSection(lines, 'Tecnologias detectadas', page.technologyHints);
    lines.push('');
  }

  if (log.errors?.length) {
    lines.push('Erros:');
    for (const error of log.errors) {
      lines.push(`- ${error.url}: ${error.message}`);
    }
  }

  return lines.join('\n');
}

function appendSection(lines, title, items) {
  if (!items?.length) return;

  lines.push(`${title}:`);
  for (const item of items.slice(0, 8)) {
    lines.push(`- ${formatItem(item)}`);
  }
}

function formatItem(item) {
  if (typeof item === 'string') return truncate(item, 220);

  if (item.value && item.context) {
    return `${item.value} | ${truncate(item.context, 180)}`;
  }

  if (item.title) {
    return truncate(`${item.title}${item.summary ? ` - ${item.summary}` : ''}`, 220);
  }

  if (item.text) {
    return truncate(`${item.text}${item.url ? ` (${item.url})` : ''}`, 220);
  }

  if (item.heading || item.textSample) {
    return truncate(`${item.heading || item.tag || 'bloco'}: ${item.textSample || ''}`, 220);
  }

  if (item.src) {
    return truncate(`${item.alt || 'imagem'} (${item.src})`, 220);
  }

  return truncate(JSON.stringify(item), 220);
}

function formatCounts(counts = {}) {
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

function formatDate(value) {
  if (!value) return 'sem data';

  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium'
  });
}

function truncate(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}
