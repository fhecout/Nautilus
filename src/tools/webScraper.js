import { load } from 'cheerio';
import dns from 'node:dns/promises';
import net from 'node:net';
import { appendScraperLog } from '../core/ScraperLogs.js';

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_ALLOWED_PAGES = 5;
const MAX_ALLOWED_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_BYTES = MAX_ALLOWED_BYTES;
const MAX_TEXT_CHARS_PER_PAGE = 12000;
const USER_AGENT =
  'NautilusWebScraper/1.0 (+https://local-nautilus-agent; research tool)';

export const definition = {
  type: 'function',
  function: {
    name: 'scrape_web_site',
    description:
      'Analisa uma pagina ou um pequeno conjunto de paginas publicas da web e retorna informacoes estruturadas: texto visivel, metadados, headings, links, imagens, tabelas, formularios, JSON-LD, blocos de codigo, scripts e estilos. Use quando o usuario pedir para ler, analisar, extrair, resumir ou buscar informacoes em um site.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            'URL publica http/https que deve ser analisada. Se o protocolo for omitido, https:// sera assumido.'
        },
        question: {
          type: 'string',
          description:
            'Opcional. O que o usuario quer descobrir naquele site. A tool usa isso para destacar trechos potencialmente relevantes.'
        },
        followInternalLinks: {
          type: 'boolean',
          description:
            'Opcional. Quando true, segue alguns links internos do mesmo dominio ate o limite maxPages.'
        },
        maxPages: {
          type: 'integer',
          description:
            'Opcional. Numero maximo de paginas internas para ler. Limite seguro: 1 a 5. Padrao: 1.'
        },
        maxBytes: {
          type: 'integer',
          description:
            'Opcional. Limite maximo de bytes por resposta. Limite seguro: ate 5242880. Padrao: 5242880.'
        }
      },
      required: ['url']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const startUrl = normalizeUrl(input.url);
  const followInternalLinks = Boolean(input.followInternalLinks);
  const maxPages = clampInteger(input.maxPages ?? 1, 1, MAX_ALLOWED_PAGES);
  const maxBytes = clampInteger(
    input.maxBytes ?? DEFAULT_MAX_BYTES,
    64 * 1024,
    MAX_ALLOWED_BYTES
  );
  const question = typeof input.question === 'string' ? input.question.trim() : '';

  const startedAt = Date.now();
  const origin = new URL(startUrl).origin;
  const queue = [startUrl];
  const visited = new Set();
  const pages = [];
  const errors = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const currentUrl = queue.shift();
    if (!currentUrl || visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      const page = await scrapePage(currentUrl, {
        question,
        maxBytes,
        timeoutMs: DEFAULT_TIMEOUT_MS
      });
      pages.push(page);

      if (followInternalLinks && pages.length < maxPages) {
        const candidates = page.links
          .filter(link => link.isInternal)
          .map(link => link.url)
          .filter(linkUrl => new URL(linkUrl).origin === origin)
          .filter(linkUrl => !visited.has(linkUrl));

        for (const linkUrl of candidates.slice(0, 20)) {
          if (queue.length + pages.length >= maxPages) break;
          queue.push(linkUrl);
        }
      }
    } catch (error) {
      errors.push({
        url: currentUrl,
        message: error.message
      });
    }
  }

  const summary = buildSiteSummary(pages, question);
  const elapsedMs = Date.now() - startedAt;

  await safeAppendScraperLog({
    query: {
      url: startUrl,
      question: question || null,
      followInternalLinks,
      maxPages,
      maxBytes
    },
    summary,
    pages: pages.map(createPageLogSnapshot),
    errors,
    elapsedMs
  });

  return {
    directReturn: false,
    finalAnswer: buildFinalAnswer(summary, pages, errors, question),
    modelInput: buildModelInput(summary, pages, errors, question),
    query: {
      url: startUrl,
      question: question || null,
      followInternalLinks,
      maxPages,
      maxBytes
    },
    summary,
    pagesAnalyzed: pages.length,
    elapsedMs,
    pages,
    errors
  };
}

async function scrapePage(url, options) {
  const response = await fetchHtml(url, options);
  const contentType = response.contentType.toLowerCase();

  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error(`Tipo de conteudo nao suportado: ${response.contentType || 'desconhecido'}`);
  }

  const $ = load(response.body);
  const baseUrl = response.finalUrl;
  const title = cleanText($('title').first().text());
  const meta = extractMeta($);
  const scripts = extractScripts($, baseUrl);
  const stylesheets = extractStylesheets($, baseUrl);
  const jsonLd = extractJsonLd($);
  const codeBlocks = extractCodeBlocks($);
  const forms = extractForms($, baseUrl);
  const tables = extractTables($);
  const headings = extractHeadings($);
  const links = extractLinks($, baseUrl);
  const images = extractImages($, baseUrl);
  const technologyHints = detectTechnologies($, scripts, stylesheets);

  $('script, style, noscript, svg, canvas, iframe').remove();
  const contentBlocks = extractContentBlocks($);
  const newsItems = extractNewsItems($, baseUrl);
  const visibleText = compactWhitespace($('body').text() || $.root().text()).slice(
    0,
    MAX_TEXT_CHARS_PER_PAGE
  );
  const priceCandidates = extractPriceCandidates(visibleText, options.question);
  const warnings = buildWarnings(visibleText, scripts, response.truncated, options.maxBytes);

  return {
    url: baseUrl,
    status: response.status,
    contentType: response.contentType,
    bytesRead: response.bytesRead,
    truncated: response.truncated,
    title,
    language: $('html').attr('lang') || null,
    meta,
    headings,
    relevantText: findRelevantText(visibleText, options.question),
    priceCandidates,
    visibleText,
    contentBlocks,
    newsItems,
    links,
    images,
    forms,
    tables,
    codeBlocks,
    jsonLd,
    scripts,
    stylesheets,
    technologyHints,
    warnings,
    counts: {
      headings: headings.length,
      contentBlocks: contentBlocks.length,
      newsItems: newsItems.length,
      priceCandidates: priceCandidates.length,
      links: links.length,
      images: images.length,
      forms: forms.length,
      tables: tables.length,
      codeBlocks: codeBlocks.length,
      jsonLd: jsonLd.length,
      scripts: scripts.length,
      stylesheets: stylesheets.length,
      technologyHints: technologyHints.length
    }
  };
}

async function scrapeWithElectron(url, timeoutMs = 15000) {
  const { BrowserWindow } = await import('electron');
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        images: false,
        webSecurity: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const timeout = setTimeout(() => {
      win.destroy();
      reject(new Error(`Timeout ao renderizar pagina com Electron: ${url}`));
    }, timeoutMs);

    win.webContents.once('did-finish-load', async () => {
      try {
        const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML');
        clearTimeout(timeout);
        win.destroy();
        resolve(html);
      } catch (err) {
        clearTimeout(timeout);
        win.destroy();
        reject(err);
      }
    });

    win.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
      clearTimeout(timeout);
      win.destroy();
      reject(new Error(`Falha ao carregar pagina no Electron: ${errorDescription} (${errorCode})`));
    });

    win.loadURL(url).catch(err => {
      clearTimeout(timeout);
      win.destroy();
      reject(err);
    });
  });
}

async function fetchHtml(url, { timeoutMs, maxBytes }) {
  let currentUrl = url;
  let redirects = 0;

  while (redirects <= 5) {
    await assertPublicHttpUrl(currentUrl);

    if (process.versions.electron) {
      try {
        const html = await scrapeWithElectron(currentUrl, timeoutMs);
        return {
          finalUrl: currentUrl,
          status: 200,
          contentType: 'text/html',
          bytesRead: Buffer.byteLength(html),
          truncated: false,
          body: html
        };
      } catch (error) {
        console.warn(`[WebScraper] Falha ao raspar com Electron, usando fallback de fetch estatico: ${error.message}`);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
          'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`Redirecionamento sem Location em ${currentUrl}`);
        currentUrl = new URL(location, currentUrl).toString();
        redirects += 1;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ao acessar ${currentUrl}`);
      }

      const payload = await readResponseWithLimit(response, maxBytes);
      return {
        finalUrl: currentUrl,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        bytesRead: payload.bytesRead,
        truncated: payload.truncated,
        body: payload.body
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Timeout apos ${timeoutMs}ms ao acessar ${currentUrl}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Limite de redirecionamentos excedido');
}

async function readResponseWithLimit(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) {
    const body = await response.text();
    const bodyBuffer = Buffer.from(body);
    const truncated = bodyBuffer.byteLength > maxBytes;

    return {
      body: truncated ? bodyBuffer.subarray(0, maxBytes).toString('utf8') : body,
      bytesRead: Math.min(bodyBuffer.byteLength, maxBytes),
      truncated
    };
  }

  const chunks = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const remaining = maxBytes - total;
    if (value.byteLength > remaining) {
      if (remaining > 0) {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
      }
      truncated = true;
      await reader.cancel();
      break;
    }

    chunks.push(value);
    total += value.byteLength;
  }

  return {
    body: Buffer.concat(chunks).toString('utf8'),
    bytesRead: total,
    truncated
  };
}

function extractMeta($) {
  const result = {
    description: getMetaContent($, 'name', 'description'),
    keywords: getMetaContent($, 'name', 'keywords'),
    canonical: $('link[rel="canonical"]').attr('href') || null,
    robots: getMetaContent($, 'name', 'robots'),
    openGraph: {},
    twitter: {}
  };

  $('meta[property^="og:"]').each((_, element) => {
    const property = $(element).attr('property');
    const content = $(element).attr('content');
    if (property && content) result.openGraph[property.replace('og:', '')] = content;
  });

  $('meta[name^="twitter:"]').each((_, element) => {
    const name = $(element).attr('name');
    const content = $(element).attr('content');
    if (name && content) result.twitter[name.replace('twitter:', '')] = content;
  });

  return result;
}

function extractHeadings($) {
  return $('h1,h2,h3,h4,h5,h6')
    .map((_, element) => ({
      level: Number(element.tagName.replace('h', '')),
      text: cleanText($(element).text())
    }))
    .get()
    .filter(item => item.text)
    .slice(0, 120);
}

function extractLinks($, baseUrl) {
  const currentOrigin = new URL(baseUrl).origin;
  const seen = new Set();

  return $('a[href]')
    .map((_, element) => {
      const href = $(element).attr('href');
      const absoluteUrl = safeAbsoluteUrl(href, baseUrl);
      if (!absoluteUrl || seen.has(absoluteUrl)) return null;
      seen.add(absoluteUrl);

      return {
        text: cleanText($(element).text()).slice(0, 160),
        url: absoluteUrl,
        isInternal: new URL(absoluteUrl).origin === currentOrigin,
        rel: $(element).attr('rel') || null
      };
    })
    .get()
    .filter(Boolean)
    .slice(0, 250);
}

function extractImages($, baseUrl) {
  const seen = new Set();

  return $('img')
    .map((_, element) => {
      const src = $(element).attr('src') || $(element).attr('data-src');
      const absoluteUrl = safeAbsoluteUrl(src, baseUrl);
      if (!absoluteUrl || seen.has(absoluteUrl)) return null;
      seen.add(absoluteUrl);

      return {
        src: absoluteUrl,
        alt: cleanText($(element).attr('alt') || ''),
        width: $(element).attr('width') || null,
        height: $(element).attr('height') || null,
        loading: $(element).attr('loading') || null
      };
    })
    .get()
    .filter(Boolean)
    .slice(0, 150);
}

function extractContentBlocks($) {
  const seen = new Set();

  return $('main, article, section, header, footer, nav, aside, [role], div')
    .map((_, element) => {
      const $element = $(element);
      const text = cleanText($element.text());
      if (text.length < 80) return null;

      const signature = text.slice(0, 180);
      if (seen.has(signature)) return null;
      seen.add(signature);

      const heading = cleanText(
        $element
          .find('h1,h2,h3,h4,h5,h6')
          .first()
          .text()
      );

      return {
        tag: element.tagName,
        role: $element.attr('role') || null,
        id: $element.attr('id') || null,
        className: $element.attr('class') || null,
        heading: heading || null,
        textSample: text.slice(0, 1200)
      };
    })
    .get()
    .filter(Boolean)
    .slice(0, 80);
}

function extractNewsItems($, baseUrl) {
  const seen = new Set();

  return $('article a[href], main a[href], [role="main"] a[href], a[href]')
    .map((_, element) => {
      const $element = $(element);
      const url = safeAbsoluteUrl($element.attr('href'), baseUrl);
      if (!url || seen.has(url)) return null;

      const text = cleanText(
        $element.attr('aria-label') ||
          $element.find('h1,h2,h3,h4,[class*="title"],[class*="titulo"]').first().text() ||
          $element.text()
      );

      if (!looksLikeHeadline(text, url, baseUrl)) return null;
      seen.add(url);

      const container = $element.closest('article, section, li, div');
      const summary = cleanText(
        container
          .find('p, [class*="summary"], [class*="resumo"], [class*="description"], [class*="descricao"]')
          .first()
          .text()
      );
      const context = cleanText(container.text()).slice(0, 500);

      return {
        title: text.slice(0, 240),
        url,
        summary: summary ? summary.slice(0, 400) : null,
        context: context || null,
        sourceBlock: container.prop('tagName')?.toLowerCase() || null
      };
    })
    .get()
    .filter(Boolean)
    .slice(0, 80);
}

function extractForms($, baseUrl) {
  return $('form')
    .map((_, form) => ({
      action: safeAbsoluteUrl($(form).attr('action') || baseUrl, baseUrl),
      method: ($(form).attr('method') || 'GET').toUpperCase(),
      fields: $(form)
        .find('input, textarea, select, button')
        .map((_, field) => ({
          tag: field.tagName,
          type: $(field).attr('type') || null,
          name: $(field).attr('name') || null,
          placeholder: $(field).attr('placeholder') || null,
          label: findFieldLabel($, field)
        }))
        .get()
        .slice(0, 80)
    }))
    .get()
    .slice(0, 20);
}

function extractTables($) {
  return $('table')
    .map((_, table) => {
      const headers = $(table)
        .find('thead th, tr:first-child th')
        .map((__, cell) => cleanText($(cell).text()))
        .get()
        .filter(Boolean);

      const rows = $(table)
        .find('tr')
        .slice(headers.length ? 1 : 0, 8)
        .map((__, row) =>
          $(row)
            .find('th,td')
            .map((___, cell) => cleanText($(cell).text()))
            .get()
            .filter(Boolean)
        )
        .get()
        .filter(row => row.length > 0);

      return { headers, sampleRows: rows };
    })
    .get()
    .slice(0, 20);
}

function extractCodeBlocks($) {
  return $('pre, code')
    .map((_, element) => {
      const text = cleanText($(element).text());
      if (!text) return null;

      return {
        tag: element.tagName,
        className: $(element).attr('class') || null,
        sample: text.slice(0, 1200)
      };
    })
    .get()
    .filter(Boolean)
    .slice(0, 80);
}

function extractJsonLd($) {
  return $('script[type="application/ld+json"]')
    .map((_, element) => {
      const raw = $(element).contents().text().trim();
      if (!raw) return null;

      try {
        return JSON.parse(raw);
      } catch {
        return { parseError: true, raw: raw.slice(0, 2000) };
      }
    })
    .get()
    .filter(Boolean)
    .slice(0, 30);
}

function extractScripts($, baseUrl) {
  return $('script')
    .map((_, element) => {
      const src = $(element).attr('src');
      const inline = $(element).contents().text().trim();

      return {
        src: src ? safeAbsoluteUrl(src, baseUrl) : null,
        type: $(element).attr('type') || 'text/javascript',
        async: $(element).attr('async') !== undefined,
        defer: $(element).attr('defer') !== undefined,
        inlineBytes: inline ? Buffer.byteLength(inline) : 0,
        inlineSample: inline ? inline.slice(0, 800) : null
      };
    })
    .get()
    .slice(0, 120);
}

function extractStylesheets($, baseUrl) {
  return $('link[rel~="stylesheet"], style')
    .map((_, element) => {
      const href = $(element).attr('href');
      const inline = element.tagName === 'style' ? $(element).contents().text().trim() : '';

      return {
        href: href ? safeAbsoluteUrl(href, baseUrl) : null,
        media: $(element).attr('media') || null,
        inlineBytes: inline ? Buffer.byteLength(inline) : 0,
        inlineSample: inline ? inline.slice(0, 800) : null
      };
    })
    .get()
    .slice(0, 120);
}

function detectTechnologies($, scripts, stylesheets) {
  const html = $.html().toLowerCase();
  const assetUrls = [...scripts.map(item => item.src), ...stylesheets.map(item => item.href)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const combined = `${html} ${assetUrls}`;
  const hints = [
    ['React', ['react', '__react', 'reactroot']],
    ['Next.js', ['_next/', 'next-data']],
    ['Vue', ['vue', '__vue__']],
    ['Nuxt', ['_nuxt/']],
    ['Angular', ['ng-version', 'angular']],
    ['Svelte', ['svelte']],
    ['Tailwind CSS', ['tailwind']],
    ['Bootstrap', ['bootstrap']],
    ['WordPress', ['wp-content', 'wp-json', 'wordpress']],
    ['Shopify', ['cdn.shopify.com', 'shopify']],
    ['Webflow', ['webflow']],
    ['Wix', ['wixstatic', 'wix.com']],
    ['Google Tag Manager', ['googletagmanager.com', 'gtm.js']],
    ['Google Analytics', ['google-analytics.com', 'gtag/js']],
    ['JSON-LD Schema', ['application/ld+json']]
  ];

  return hints
    .filter(([, needles]) => needles.some(needle => combined.includes(needle)))
    .map(([name]) => name);
}

function buildWarnings(visibleText, scripts, responseTruncated, maxBytes) {
  const warnings = [];

  if (responseTruncated) {
    warnings.push(
      `A resposta passou de ${maxBytes} bytes. A tool analisou o comeco da pagina e truncou o restante para nao falhar.`
    );
  }

  if (visibleText.length < 300 && scripts.length >= 5) {
    warnings.push(
      'A pagina parece depender bastante de JavaScript. Esta tool le o HTML entregue pelo servidor, nao executa a aplicacao no navegador.'
    );
  }

  if (visibleText.length >= MAX_TEXT_CHARS_PER_PAGE) {
    warnings.push('O texto visivel foi truncado para manter a resposta dentro de um limite seguro.');
  }

  return warnings;
}

function extractPriceCandidates(text, question) {
  if (!isPriceQuestion(question)) return [];

  const normalizedText = cleanText(text);
  const values = [];
  const seen = new Set();
  const priceRegex =
    /(?:US\$|R\$|\$|€|£)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s?(?:USD|BRL|EUR|USDT|BTC)/gi;

  let match;
  while ((match = priceRegex.exec(normalizedText)) !== null && values.length < 30) {
    const value = match[0].trim();
    const start = Math.max(0, match.index - 140);
    const end = Math.min(normalizedText.length, match.index + value.length + 140);
    const context = cleanExtractedText(normalizedText.slice(start, end));

    if (!isRelevantPriceContext(context, question)) continue;

    const key = `${value}|${context.slice(0, 80)}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    values.push({
      value,
      context: truncateText(context, 320)
    });
  }

  return values.slice(0, 12);
}

function isRelevantPriceContext(context, question) {
  const normalized = `${context} ${question || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const hasMarketTerm =
    /bitcoin|btc|cripto|crypto|preco|price|cotacao|cotacao|valor|mercado|usd|brl|dolar|real/.test(
      normalized
    );
  const looksLikeDateOnly = /\b(19|20)\d{2}\b/.test(context) && !/[$€£]|usd|brl|usdt/i.test(context);

  return hasMarketTerm && !looksLikeDateOnly;
}

function looksLikeHeadline(text, url, baseUrl) {
  if (!text || text.length < 24 || text.length > 260) return false;

  const lowerText = text.toLowerCase();
  const blockedText = [
    'assine',
    'entrar',
    'login',
    'minha conta',
    'menu',
    'buscar',
    'newsletter',
    'termos de uso',
    'politica de privacidade'
  ];
  if (blockedText.some(blocked => lowerText.includes(blocked))) return false;

  const parsedUrl = new URL(url);
  const base = new URL(baseUrl);
  if (!isSameSiteHost(parsedUrl.hostname, base.hostname)) {
    return false;
  }

  const path = parsedUrl.pathname.toLowerCase();
  const blockedPaths = ['/login', '/minha-conta', '/assine', '/newsletter'];
  if (blockedPaths.some(blocked => path.startsWith(blocked))) return false;

  return path.split('/').filter(Boolean).length >= 2 || /noticia|news|materia|blog|politica|economia|mundo|brasil|esporte|cultura|tecnologia/.test(path);
}

function isSameSiteHost(hostname, baseHostname) {
  if (hostname === baseHostname || hostname.endsWith(`.${baseHostname}`)) return true;

  const hostnameKey = getDomainKey(hostname);
  const baseKey = getDomainKey(baseHostname);

  return Boolean(hostnameKey && baseKey && hostnameKey === baseKey);
}

function getDomainKey(hostname) {
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2) return hostname;
  return parts.slice(-2).join('.');
}

function findRelevantText(text, question) {
  if (!question) return [];

  const keywords = question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/i)
    .filter(word => word.length >= 4)
    .slice(0, 12);

  if (keywords.length === 0) return [];

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

  return sentences
    .map(sentence => ({
      text: sentence,
      score: scoreText(sentence, keywords)
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(item => item.text.slice(0, 600));
}

function scoreText(text, keywords) {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return keywords.reduce((score, keyword) => {
    return normalized.includes(keyword) ? score + 1 : score;
  }, 0);
}

function rankNewsItemsForQuestion(newsItems, question) {
  const keywords = extractQuestionKeywords(question);
  if (keywords.length === 0) return [];

  return newsItems
    .map(item => {
      const text = normalizeForMatch(`${item.title} ${item.summary || ''} ${item.context || ''}`);
      const score = keywords.reduce((total, keyword) => {
        if (text.includes(keyword)) return total + 3;
        if (keyword.length > 5 && text.includes(keyword.slice(0, -1))) return total + 1;
        return total;
      }, 0);

      return { ...item, relevanceScore: score };
    })
    .filter(item => item.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function extractQuestionKeywords(question) {
  const stopWords = new Set([
    'noticia',
    'noticias',
    'sobre',
    'site',
    'veja',
    'acesse',
    'olhe',
    'abra',
    'leia',
    'resultado',
    'link',
    'quero',
    'saber',
    'mais',
    'coisa',
    'coisas'
  ]);

  const keywords = normalizeForMatch(question)
    .split(/[^a-z0-9]+/i)
    .filter(word => word.length >= 4)
    .filter(word => !stopWords.has(word))
    .slice(0, 12);

  if (keywords.includes('corinthians')) {
    keywords.push('corint', 'timao');
  }

  return [...new Set(keywords)];
}

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildSiteSummary(pages, question) {
  if (pages.length === 0) {
    return {
      title: null,
      description: null,
      question,
      keyHeadings: [],
      relevantText: [],
      priceCandidates: [],
      relatedNewsItems: [],
      newsItems: []
    };
  }

  const firstPage = pages[0];
  const relevantText = pages.flatMap(page => page.relevantText).slice(0, 15);
  const priceCandidates = pages.flatMap(page => page.priceCandidates).slice(0, 12);
  const newsItems = pages.flatMap(page => page.newsItems).slice(0, 30);
  const relatedNewsItems = rankNewsItemsForQuestion(newsItems, question).slice(0, 12);

  return {
    title: firstPage.title || firstPage.meta.openGraph.title || null,
    description:
      firstPage.meta.description ||
      firstPage.meta.openGraph.description ||
      firstPage.meta.twitter.description ||
      null,
    question: question || null,
    keyHeadings: pages
      .flatMap(page => page.headings)
      .filter(heading => heading.level <= 3)
      .map(heading => heading.text)
      .slice(0, 30),
    relevantText,
    priceCandidates,
    relatedNewsItems,
    newsItems
  };
}

function buildFinalAnswer(summary, pages, errors, question) {
  if (pages.length === 0) {
    const errorMessage = errors[0]?.message || 'nao foi possivel acessar a pagina';
    return `Nao consegui analisar o site: ${errorMessage}`;
  }

  if ((isNewsQuestion(question) || siteLooksLikeNews(summary)) && summary.newsItems.length > 0) {
    const lines = summary.newsItems.slice(0, 10).map((item, index) => {
      const summaryText = item.summary ? ` - ${item.summary}` : '';
      return `${index + 1}. ${item.title}${summaryText}`;
    });

    return `Noticias relevantes encontradas:\n${lines.join('\n\n')}`;
  }

  if (summary.relevantText.length > 0) {
    const bullets = buildReadableBullets(summary.relevantText, 6, 420);
    return `Informacoes encontradas:\n${bullets.map((item, index) => `${index + 1}. ${item}`).join('\n\n')}`;
  }

  const parts = [];
  if (summary.title) parts.push(summary.title);
  if (summary.description) parts.push(summary.description);
  if (summary.keyHeadings.length > 0) {
    parts.push(`Principais topicos:\n${summary.keyHeadings.slice(0, 10).map(item => `- ${item}`).join('\n')}`);
  }

  return parts.join('\n\n') || 'Analise concluida, mas nao encontrei texto relevante na pagina.';
}

function buildModelInput(summary, pages, errors, question) {
  if (pages.length === 0) {
    const errorMessage = errors[0]?.message || 'nao foi possivel acessar a pagina';
    return `Nao consegui acessar o site. Erro: ${errorMessage}`;
  }

  const page = pages[0];
  const priceCandidates = summary.priceCandidates
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item.value} - ${item.context}`)
    .join('\n');
  const relatedNews = summary.relatedNewsItems
    .slice(0, 12)
    .map(
      (item, index) =>
        `${index + 1}. ${item.title}${item.summary ? ` - ${item.summary}` : ''}${
          item.context ? ` | contexto: ${truncateText(item.context, 220)}` : ''
        }`
    )
    .join('\n');
  const news = summary.newsItems
    .slice(0, 12)
    .map((item, index) => `${index + 1}. ${item.title}${item.summary ? ` - ${item.summary}` : ''}`)
    .join('\n');
  const relevant = buildReadableBullets(summary.relevantText, 8, 360)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
  const headings = summary.keyHeadings
    .slice(0, 10)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');
  const priceInstructions = isPriceQuestion(question)
    ? [
        'Responda exatamente o que o usuario pediu. Ele perguntou preco, cotacao, valor ou quanto esta; informe o preco/cotacao encontrado e nao faca resumo geral do site.',
        'Para preco/cotacao, prefira o valor que aparecer na descricao do site ou o primeiro candidato ligado diretamente a "Bitcoin preco", "BTC" ou "preco de agora". Ignore volume, capitalizacao de mercado, maxima, minima e outros indicadores se o usuario so perguntou o preco atual.'
      ]
    : [
        'Responda exatamente o que o usuario pediu agora. Nao reaproveite assuntos anteriores da conversa.',
        'Se o usuario pediu noticias sobre um assunto, filtre os itens que tenham relacao com esse assunto e explique o contexto em texto natural, sem apenas repetir manchetes.',
        'Se houver noticias relacionadas, entregue um briefing curto. Para cada item importante, explique: o que aconteceu, quem esta envolvido e por que importa.',
        'Quando fizer sentido, termine com uma frase curta dizendo que o usuario pode pedir para ler uma noticia especifica pelo numero ou pelo assunto.',
        'Se o usuario pediu para olhar/analisar o site de forma geral, diga do que o site trata e os principais itens encontrados.'
      ];

  return [
    'Voce acessou um site autorizado pelo usuario.',
    'Responda em portugues do Brasil.',
    ...priceInstructions,
    'Nao envie links, nao copie texto cru, nao responda em outro idioma.',
    'Se nao encontrar o dado pedido, diga claramente que o site acessado nao trouxe esse dado no HTML analisado.',
    'Use no maximo 4 pontos principais.',
    question ? `Pedido do usuario: ${question}` : null,
    `Titulo do site: ${summary.title || page.title || 'sem titulo'}`,
    summary.description ? `Descricao: ${summary.description}` : null,
    priceCandidates ? `Possiveis precos/cotacoes encontrados:\n${priceCandidates}` : null,
    relatedNews ? `Noticias mais relacionadas ao pedido:\n${relatedNews}` : null,
    news ? `Noticias/itens encontrados:\n${news}` : null,
    relevant ? `Trechos relevantes:\n${relevant}` : null,
    !news && !relevant && headings ? `Topicos encontrados:\n${headings}` : null
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function safeAppendScraperLog(entry) {
  try {
    await appendScraperLog(entry);
  } catch (error) {
    console.error(`[ScraperLogs] Falha ao gravar log: ${error.message}`);
  }
}

function createPageLogSnapshot(page) {
  return {
    url: page.url,
    status: page.status,
    contentType: page.contentType,
    bytesRead: page.bytesRead,
    truncated: page.truncated,
    title: page.title,
    language: page.language,
    meta: page.meta,
    counts: page.counts,
    warnings: page.warnings,
    headings: page.headings?.slice(0, 20),
    relevantText: page.relevantText?.slice(0, 10),
    priceCandidates: page.priceCandidates?.slice(0, 10),
    newsItems: page.newsItems?.slice(0, 15),
    contentBlocks: page.contentBlocks?.slice(0, 12),
    links: page.links?.slice(0, 20),
    images: page.images?.slice(0, 12),
    forms: page.forms?.slice(0, 8),
    tables: page.tables?.slice(0, 8),
    codeBlocks: page.codeBlocks?.slice(0, 8),
    jsonLd: page.jsonLd?.slice(0, 5),
    scripts: page.scripts?.slice(0, 12),
    stylesheets: page.stylesheets?.slice(0, 12),
    technologyHints: page.technologyHints
  };
}

function buildReadableBullets(items, maxItems, maxChars) {
  const seen = new Set();

  return items
    .map(item => cleanExtractedText(item))
    .filter(item => item.length >= 40)
    .filter(item => {
      const key = item.slice(0, 90).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems)
    .map(item => truncateText(item, maxChars));
}

function cleanExtractedText(value) {
  return cleanText(value)
    .replace(/Publicidade/gi, '')
    .replace(/Continua apos a publicidade/gi, '')
    .replace(/Continua após a publicidade/gi, '')
    .replace(/Facebook Twitter Whatsapp/gi, '')
    .replace(/\b[A-Z]{2,}\s*-\s*/g, '')
    .trim();
}

function truncateText(value, maxChars) {
  if (value.length <= maxChars) return value;

  const sliced = value.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${sliced.slice(0, lastSpace > 240 ? lastSpace : maxChars).trim()}...`;
}

function isNewsQuestion(question) {
  const normalized = String(question || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return /noticia|noticias|manchete|manchetes|jornal|relevante|relevantes|destaque|destaques/.test(
    normalized
  );
}

function isPriceQuestion(question) {
  const normalized = String(question || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return /preco|cotacao|valor|quanto esta|quanto custa|price|usd|brl|bitcoin|btc/.test(
    normalized
  );
}

function siteLooksLikeNews(summary) {
  const normalized = `${summary.title || ''} ${summary.description || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return /noticia|noticias|jornal|esporte|politica|economia|entretenimento/.test(normalized);
}

function getMetaContent($, attribute, value) {
  return $(`meta[${attribute}="${value}"]`).attr('content') || null;
}

function findFieldLabel($, field) {
  const id = $(field).attr('id');
  if (id) {
    const label = cleanText($(`label[for="${cssEscape(id)}"]`).text());
    if (label) return label;
  }

  return cleanText($(field).closest('label').text());
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return { url: args };
    }
  }

  return args && typeof args === 'object' ? args : {};
}

function normalizeUrl(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('O parametro url e obrigatorio');
  }

  const trimmed = value.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  parsed.hash = '';

  return parsed.toString();
}

async function assertPublicHttpUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Apenas URLs http/https sao permitidas');
  }

  if (url.username || url.password) {
    throw new Error('URL com credenciais nao e permitida');
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '0.0.0.0'
  ) {
    throw new Error('Hosts locais ou privados nao sao permitidos');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error('Enderecos privados nao sao permitidos');
    }
    return;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: false });
  if (addresses.length === 0) {
    throw new Error(`Nao foi possivel resolver DNS para ${hostname}`);
  }

  if (addresses.some(entry => isPrivateAddress(entry.address))) {
    throw new Error('O host resolve para endereco privado e foi bloqueado');
  }
}

function isPrivateAddress(address) {
  if (address.includes('.') && address.includes(':')) {
    const mappedIpv4 = address.slice(address.lastIndexOf(':') + 1);
    if (net.isIP(mappedIpv4) === 4) return isPrivateIpv4(mappedIpv4);
  }

  if (net.isIP(address) === 4) return isPrivateIpv4(address);
  if (net.isIP(address) === 6) return isPrivateIpv6(address);
  return true;
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function safeAbsoluteUrl(value, baseUrl) {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:')
  ) {
    return null;
  }

  try {
    const url = new URL(trimmed, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}

function cleanText(value) {
  return compactWhitespace(value || '').trim();
}

function compactWhitespace(value) {
  return String(value).replace(/\s+/g, ' ');
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, '\\$&');
}
