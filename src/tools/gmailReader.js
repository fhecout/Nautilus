import { getAuthenticatedGmailClient, getGmailSetupInstructions } from '../core/GmailAuth.js';

const MAX_EMAILS = 20;
const MAX_BODY_CHARS = 3000;
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'bol.com.br',
  'uol.com.br'
]);

export const definition = {
  type: 'function',
  function: {
    name: 'read_gmail',
    description:
      'Le emails da caixa de entrada do Gmail conectado. Use quando o usuario pedir para ver, ler, procurar, resumir ou verificar emails no Gmail.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Busca opcional no Gmail. Exemplos: from:cliente@example.com, subject:boleto, newer_than:7d, is:unread.'
        },
        maxResults: {
          type: 'integer',
          description: 'Quantidade maxima de emails. Limite: 1 a 20. Padrao: 10.'
        },
        includeBody: {
          type: 'boolean',
          description:
            'Quando true, extrai parte do corpo do email. Padrao: true para permitir resumo.'
        },
        question: {
          type: 'string',
          description: 'Pedido original do usuario sobre os emails.'
        }
      },
      required: []
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const maxResults = clampInteger(input.maxResults ?? 10, 1, MAX_EMAILS);
  const includeBody = input.includeBody !== false;
  const question = typeof input.question === 'string' ? input.question.trim() : '';

  let gmail;
  try {
    gmail = await getAuthenticatedGmailClient();
  } catch (error) {
    return {
      directReturn: true,
      finalAnswer: getGmailSetupInstructions(error.message),
      emails: []
    };
  }

  const list = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults,
    q: query || undefined
  });

  const messages = list.data.messages || [];
  const emails = [];

  for (const message of messages) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: includeBody ? 'full' : 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date']
    });

    emails.push(parseGmailMessage(detail.data, includeBody));
  }

  const finalAnswer = buildFinalAnswer({ emails, query, includeBody, question });
  const modelInput = buildModelInput({ emails, query, includeBody, question });

  return {
    directReturn: true,
    modelInput,
    finalAnswer,
    query: {
      query: query || null,
      maxResults,
      includeBody,
      question: question || null
    },
    emails
  };
}

function parseGmailMessage(message, includeBody) {
  const headers = getHeaders(message.payload?.headers || []);
  const body = includeBody ? extractBody(message.payload).slice(0, MAX_BODY_CHARS) : '';
  const sender = parseSender(headers.from || '');
  const textForAnalysis = cleanText(`${headers.subject || ''} ${message.snippet || ''} ${body}`);
  const classification = classifyEmail({
    from: headers.from || '',
    subject: headers.subject || '',
    text: textForAnalysis
  });

  return {
    id: message.id,
    threadId: message.threadId,
    from: headers.from || null,
    senderName: sender.name,
    senderEmail: sender.email,
    senderDomain: sender.domain,
    senderOrganization: sender.organization,
    to: headers.to || null,
    subject: headers.subject || '(sem assunto)',
    date: headers.date || null,
    dateFormatted: formatDate(headers.date, message.internalDate),
    isUnread: Array.isArray(message.labelIds) ? message.labelIds.includes('UNREAD') : false,
    category: classification.category,
    urgency: classification.urgency,
    actionHint: classification.actionHint,
    why: classification.why,
    snippet: cleanText(message.snippet || ''),
    body: cleanText(body)
  };
}

function buildFinalAnswer({ emails, query, question }) {
  if (emails.length === 0) {
    return query
      ? `Nao encontrei emails na caixa de entrada para a busca: ${query}`
      : 'Nao encontrei emails na caixa de entrada.';
  }

  const unreadCount = emails.filter(email => email.isUnread).length;
  const important = emails
    .filter(email => email.urgency !== 'baixa' || email.actionHint !== 'Apenas acompanhar')
    .slice(0, 3);

  const lines = [
    `Encontrei ${emails.length} email${emails.length === 1 ? '' : 's'} na caixa de entrada${query ? ` para "${query}"` : ' recente'}.`,
    unreadCount > 0 ? `${unreadCount} parece${unreadCount === 1 ? '' : 'm'} nao lido${unreadCount === 1 ? '' : 's'}.` : 'Nenhum deles veio marcado como nao lido nessa busca.',
    ''
  ];

  if (important.length > 0) {
    lines.push('Mais importantes primeiro:');
    for (const email of important) {
      lines.push(formatEmailBullet(email));
    }
    lines.push('');
  }

  lines.push('Emails recebidos:');
  for (const email of emails) {
    lines.push(formatEmailBullet(email));
  }

  const categories = summarizeCategories(emails);
  if (categories) {
    lines.push('');
    lines.push(`Resumo por tipo: ${categories}.`);
  }

  if (question) {
    lines.push('');
    lines.push(`Pedido analisado: ${question}`);
  }

  return lines.join('\n');
}

function formatEmailBullet(email) {
  const company = email.senderOrganization || email.senderName || email.senderDomain || 'remetente nao identificado';
  const sender = email.senderEmail ? `${company} <${email.senderEmail}>` : company;
  const status = email.isUnread ? 'nao lido' : 'lido/sem marcador de nao lido';
  const preview = email.snippet || email.body || 'sem trecho disponivel';

  return [
    `- ${sender}`,
    `  Assunto: ${email.subject}`,
    `  Quando: ${email.dateFormatted || email.date || 'data nao informada'} | Status: ${status}`,
    `  Tipo: ${email.category} | Urgencia: ${email.urgency}`,
    `  Sobre: ${preview}`,
    `  Sugestao: ${email.actionHint}`
  ].join('\n');
}

function buildModelInput({ emails, query, includeBody, question }) {
  if (emails.length === 0) {
    return query
      ? `Nao encontrei emails na caixa de entrada para a busca: ${query}`
      : 'Nao encontrei emails na caixa de entrada.';
  }

  const items = emails
    .map((email, index) => {
      return [
        `Email ${index + 1}`,
        `Empresa/remetente provavel: ${email.senderOrganization || 'nao identificado'}`,
        `De: ${email.from || 'nao informado'}`,
        `Email do remetente: ${email.senderEmail || 'nao informado'}`,
        `Assunto: ${email.subject}`,
        `Data: ${email.dateFormatted || email.date || 'nao informada'}`,
        `Status: ${email.isUnread ? 'nao lido' : 'lido/sem marcador de nao lido'}`,
        `Tipo: ${email.category}`,
        `Urgencia: ${email.urgency}`,
        `Acao sugerida: ${email.actionHint}`,
        `Motivo da classificacao: ${email.why}`,
        `Trecho: ${email.snippet}`,
        includeBody && email.body ? `Corpo extraido: ${email.body}` : null
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return [
    'Voce leu emails autorizados da caixa de entrada do Gmail.',
    'Responda em portugues do Brasil.',
    'Seja objetivo, profissional e especifico.',
    'Diga de qual empresa/remetente veio cada email quando isso estiver claro.',
    'Diga sobre o que parece ser cada email, usando assunto, trecho e corpo extraido.',
    'Destaque emails urgentes, cobranças, seguranca, entregas, trabalho e mensagens que precisam de acao.',
    'Nao exponha dados sensiveis desnecessarios.',
    'Se o usuario pediu resumo, agrupe por importancia.',
    'Se houver emails urgentes, destaque primeiro.',
    query ? `Busca usada no Gmail: ${query}` : 'Busca usada no Gmail: caixa de entrada recente.',
    question ? `Pedido original do usuario: ${question}` : null,
    `Emails encontrados: ${emails.length}`,
    items
  ].filter(Boolean).join('\n\n');
}

function getHeaders(headers) {
  return headers.reduce((result, header) => {
    result[header.name.toLowerCase()] = header.value;
    return result;
  }, {});
}

function extractBody(payload) {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  const parts = flattenParts(payload.parts || []);
  const plain = parts.find(part => part.mimeType === 'text/plain' && part.body?.data);
  if (plain) return decodeBase64Url(plain.body.data);

  const html = parts.find(part => part.mimeType === 'text/html' && part.body?.data);
  if (html) return stripHtml(decodeBase64Url(html.body.data));

  return '';
}

function parseSender(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  const email = cleanText(match ? match[2] : raw.includes('@') ? raw : '');
  const name = cleanText(match ? match[1].replace(/^"|"$/g, '') : raw.includes('@') ? '' : raw);
  const domain = email.includes('@') ? email.split('@').pop().toLowerCase() : '';
  const organization = inferOrganization(name, domain);

  return {
    name: name || null,
    email: email || null,
    domain: domain || null,
    organization: organization || null
  };
}

function inferOrganization(name, domain) {
  if (name && !looksLikePersonalName(name)) return cleanupOrganization(name);
  if (!domain || FREE_EMAIL_DOMAINS.has(domain)) return name ? cleanupOrganization(name) : '';

  const parts = domain.split('.');
  const base = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return titleCase(base.replace(/[-_]+/g, ' '));
}

function looksLikePersonalName(value) {
  const words = cleanText(value).split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 4 && words.every(word => /^[A-ZÀ-Ý][a-zà-ÿ]+\.?$/.test(word));
}

function cleanupOrganization(value) {
  return cleanText(value)
    .replace(/\s+via\s+.+$/i, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyEmail({ from, subject, text }) {
  const normalized = normalizeText(`${from} ${subject} ${text}`);
  const checks = [
    {
      category: 'seguranca/acesso',
      urgency: 'alta',
      actionHint: 'Verificar se foi voce; se nao foi, trocar senha ou revisar seguranca',
      why: 'fala de login, codigo, senha, acesso ou verificacao',
      terms: ['codigo', 'verificacao', 'senha', 'login', 'acesso', 'seguranca', '2fa', 'autenticacao']
    },
    {
      category: 'financeiro/cobranca',
      urgency: 'alta',
      actionHint: 'Conferir valor, vencimento e se precisa pagar',
      why: 'parece fatura, boleto, pagamento, nota fiscal ou cobranca',
      terms: ['boleto', 'fatura', 'pagamento', 'vencimento', 'cobranca', 'nota fiscal', 'nf-e', 'pix', 'recibo']
    },
    {
      category: 'entrega/compra',
      urgency: 'media',
      actionHint: 'Acompanhar entrega, pedido ou compra',
      why: 'fala de pedido, compra, entrega, rastreio ou envio',
      terms: ['pedido', 'compra', 'entrega', 'rastreio', 'enviado', 'transportadora', 'chegou', 'shipment']
    },
    {
      category: 'trabalho/reuniao',
      urgency: 'media',
      actionHint: 'Responder ou acompanhar se envolver tarefa, reuniao ou prazo',
      why: 'parece mensagem de trabalho, reuniao, proposta ou tarefa',
      terms: ['reuniao', 'meeting', 'proposta', 'contrato', 'projeto', 'tarefa', 'prazo', 'cliente', 'agenda']
    },
    {
      category: 'suporte/atendimento',
      urgency: 'media',
      actionHint: 'Acompanhar o chamado ou responder se pedirem informacoes',
      why: 'parece chamado, suporte ou atendimento',
      terms: ['suporte', 'ticket', 'chamado', 'protocolo', 'atendimento', 'solicitacao']
    },
    {
      category: 'promocao/marketing',
      urgency: 'baixa',
      actionHint: 'Apenas acompanhar',
      why: 'parece campanha, oferta, desconto ou newsletter',
      terms: ['oferta', 'promocao', 'desconto', 'newsletter', 'black friday', 'cupom', 'aproveite']
    }
  ];

  for (const check of checks) {
    if (check.terms.some(term => normalized.includes(term))) {
      return {
        category: check.category,
        urgency: check.urgency,
        actionHint: check.actionHint,
        why: check.why
      };
    }
  }

  return {
    category: 'geral',
    urgency: normalized.includes('urgente') || normalized.includes('importante') ? 'alta' : 'baixa',
    actionHint: normalized.includes('responda') || normalized.includes('confirmar') ? 'Responder ou confirmar' : 'Apenas acompanhar',
    why: 'sem sinais claros de categoria especifica'
  };
}

function summarizeCategories(emails) {
  const counts = emails.reduce((result, email) => {
    result[email.category] = (result[email.category] || 0) + 1;
    return result;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${count} ${category}`)
    .join(', ');
}

function formatDate(headerDate, internalDate) {
  const date = headerDate ? new Date(headerDate) : internalDate ? new Date(Number(internalDate)) : null;
  if (!date || Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function titleCase(value) {
  return cleanText(value).replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function flattenParts(parts) {
  const output = [];

  for (const part of parts) {
    output.push(part);
    if (part.parts?.length) {
      output.push(...flattenParts(part.parts));
    }
  }

  return output;
}

function decodeBase64Url(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
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

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}
