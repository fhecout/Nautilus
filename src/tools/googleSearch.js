import { load } from 'cheerio';
const DEFAULT_TIMEOUT_MS = 12000;
const MAX_RESULTS = 10;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const definition = {
  type: 'function',
  function: {
    name: 'search_google',
    description:
      'Pesquisa na web por qualquer assunto, pergunta ou necessidade do dia a dia e retorna somente nome do resultado e link. Esta tool nunca acessa nem escaneia os sites encontrados.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Termo de busca. Exemplo: Corinthians ultimas noticias, preco iPhone 16, documentacao Node.js fetch.'
        },
        searchType: {
          type: 'string',
          enum: ['auto', 'web', 'news'],
          description:
            'Tipo de pesquisa. auto usa busca web geral para retornar links diretos. news usa Google News RSS apenas quando o usuario pedir especificamente resultados de noticias. Padrao: auto.'
        },
        scanResults: {
          type: 'boolean',
          description:
            'Ignorado. A busca sempre retorna somente links; para acessar um link, use a tool scrape_web_site depois que o usuario autorizar.'
        },
        maxResults: {
          type: 'integer',
          description: 'Quantidade maxima de resultados. Limite seguro: 1 a 10. Padrao: 5.'
        }
      },
      required: ['query']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const query = normalizeQuery(input.query);
  const searchType = normalizeSearchType(input.searchType);
  const maxResults = clampInteger(input.maxResults ?? 5, 1, MAX_RESULTS);

  const startedAt = Date.now();
  const searchResult =
    searchType === 'news'
      ? await searchGoogleNews(query, maxResults)
      : await searchGoogleWeb(query, maxResults);

  const finalAnswer = buildFinalAnswer({
    query,
    searchType,
    results: searchResult.results
  });

  return {
    directReturn: true,
    finalAnswer,
    query: {
      text: query,
      searchType,
      scanResults: false,
      maxResults
    },
    provider: searchResult.provider,
    results: searchResult.results,
    scannedPages: [],
    elapsedMs: Date.now() - startedAt,
    warnings: searchResult.warnings
  };
}

async function searchGoogleNews(query, maxResults) {
  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', query);
  url.searchParams.set('hl', 'pt-BR');
  url.searchParams.set('gl', 'BR');
  url.searchParams.set('ceid', 'BR:pt-419');

  const xml = await fetchText(url.toString());
  const $ = load(xml, { xmlMode: true });

  const results = $('item')
    .map((_, item) => ({
      title: cleanText($(item).find('title').first().text()),
      url: cleanText($(item).find('link').first().text()),
      snippet: cleanText(stripHtml($(item).find('description').first().text())),
      source: cleanText($(item).find('source').first().text()) || null,
      publishedAt: cleanText($(item).find('pubDate').first().text()) || null
    }))
    .get()
    .filter(result => result.title && result.url)
    .slice(0, maxResults);

  return {
    provider: 'google-news-rss',
    results,
    warnings: []
  };
}

async function searchGoogleWeb(query, maxResults) {
  const googleUrl = new URL('https://www.google.com/search');
  googleUrl.searchParams.set('q', query);
  googleUrl.searchParams.set('hl', 'pt-BR');
  googleUrl.searchParams.set('gl', 'br');
  googleUrl.searchParams.set('num', String(maxResults));

  try {
    const html = await fetchText(googleUrl.toString());
    const results = parseGoogleSearchHtml(html).slice(0, maxResults);

    if (results.length > 0) {
      return {
        provider: 'google-search-html',
        results,
        warnings: []
      };
    }
  } catch {
    // Public Google HTML can block automated clients. The fallback keeps the tool useful.
  }

  const fallback = await searchDuckDuckGo(query, maxResults);
  return {
    provider: fallback.provider,
    results: fallback.results,
    warnings: ['Google nao retornou HTML pesquisavel; usei DuckDuckGo HTML como fallback.']
  };
}

async function searchDuckDuckGo(query, maxResults) {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);

  const html = await fetchText(url.toString());
  const $ = load(html);

  const results = $('.result')
    .map((_, element) => {
      const link = $(element).find('.result__a').first();
      const title = cleanText(link.text());
      const urlValue = unwrapDuckDuckGoUrl(link.attr('href'));
      const snippet = cleanText($(element).find('.result__snippet').first().text());

      if (!title || !urlValue || isBlockedSearchResultUrl(urlValue)) return null;
      return {
        title,
        url: urlValue,
        snippet,
        source: getHostname(urlValue),
        publishedAt: null
      };
    })
    .get()
    .filter(Boolean)
    .slice(0, maxResults);

  return {
    provider: 'duckduckgo-html-fallback',
    results
  };
}

function parseGoogleSearchHtml(html) {
  const $ = load(html);
  const seen = new Set();
  const results = [];

  $('a[href]').each((_, element) => {
    const $element = $(element);
    const title = cleanText($element.find('h3').first().text() || $element.text());
    const url = unwrapGoogleUrl($element.attr('href'));

    if (!title || !url || seen.has(url)) return;
    if (!isHttpUrl(url) || isGoogleInternalUrl(url) || isBlockedSearchResultUrl(url)) return;

    const container = $element.closest('div');
    const snippet = cleanText(container.text()).replace(title, '').slice(0, 300);

    seen.add(url);
    results.push({
      title,
      url,
      snippet,
      source: getHostname(url),
      publishedAt: null
    });
  });

  return results;
}

function buildFinalAnswer({ query, searchType, results }) {
  if (results.length === 0) {
    return `Nao encontrei resultados para: ${query}`;
  }

  const header =
    searchType === 'news'
      ? `Resultados de noticias para "${query}":`
      : `Resultados encontrados para "${query}":`;

  const resultLines = results
    .slice(0, 10)
    .map((result, index) => {
      return `${index + 1}. ${getResultDisplayName(result)}\n${result.url}`;
    })
    .join('\n\n');

  return `${header}\n${resultLines}`;
}

function getResultDisplayName(result) {
  if (result.source) {
    return result.title ? `${result.title}` : result.source;
  }

  return result.title || getHostname(result.url) || 'Resultado';
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,*/*;q=0.5',
        'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Timeout apos ${DEFAULT_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

function normalizeQuery(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('O parametro query e obrigatorio');
  }

  const query = value.trim();
  if (query.length < 2) {
    throw new Error('A busca precisa ter pelo menos 2 caracteres');
  }

  return query;
}

function normalizeSearchType(value) {
  if (value === 'web' || value === 'news') return value;
  return 'web';
}

function unwrapGoogleUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value, 'https://www.google.com');
    if (url.pathname === '/url' && url.searchParams.has('q')) {
      return url.searchParams.get('q');
    }

    return url.protocol.startsWith('http') ? url.toString() : null;
  } catch {
    return null;
  }
}

function unwrapDuckDuckGoUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    return uddg || url.toString();
  } catch {
    return null;
  }
}

function isGoogleInternalUrl(value) {
  const hostname = getHostname(value);
  return (
    hostname === 'google.com' ||
    hostname.endsWith('.google.com') ||
    hostname === 'gstatic.com' ||
    hostname.endsWith('.gstatic.com')
  );
}

function isBlockedSearchResultUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, '');

    return (
      (hostname === 'duckduckgo.com' && url.pathname.startsWith('/y.js')) ||
      (hostname === 'bing.com' && url.pathname.startsWith('/aclick')) ||
      url.searchParams.has('ad_domain') ||
      url.searchParams.has('ad_provider')
    );
  } catch {
    return true;
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getHostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function stripHtml(value) {
  return load(value || '').text();
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}
