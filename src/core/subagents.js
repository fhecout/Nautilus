export const AGENT_TEAM = [
  {
    id: 'architect',
    name: 'Architect Agent',
    shortName: 'ARCHITECT',
    specialty: 'Arquitetura, impacto tecnico, design de solucao e trade-offs.',
    defaultVote: 'executar',
    keywords: ['projeto', 'arquitetura', 'backend', 'codigo', 'api', 'sistema', 'refatorar', 'banco', 'sqlite']
  },
  {
    id: 'security',
    name: 'Security Agent',
    shortName: 'SECURITY',
    specialty: 'Riscos, privacidade, permissoes, Safe Mode, SQL destrutivo e dados sensiveis.',
    defaultVote: 'pedir_confirmacao',
    keywords: ['apagar', 'delete', 'remover', 'senha', 'token', 'gmail', 'email', 'sql', 'arquivo', 'credencial']
  },
  {
    id: 'research',
    name: 'Research Agent',
    shortName: 'RESEARCH',
    specialty: 'Contexto externo, evidencias, documentos, PDFs, Gmail, web e informacao incerta.',
    defaultVote: 'pesquisar_mais',
    keywords: ['pesquise', 'site', 'web', 'noticia', 'pdf', 'email', 'gmail', 'documento', 'fonte', 'compare']
  },
  {
    id: 'executor',
    name: 'Executor Agent',
    shortName: 'EXECUTOR',
    specialty: 'Plano de acao, ordem de tools, criterios de pronto e caminho mais simples.',
    defaultVote: 'executar',
    keywords: ['fazer', 'executar', 'criar', 'implementar', 'rodar', 'corrigir', 'converter', 'zipar', 'buscar']
  },
  {
    id: 'critic',
    name: 'Critic Agent',
    shortName: 'CRITIC',
    specialty: 'Falhas, contradicoes, lacunas, edge cases e qualidade da decisao final.',
    defaultVote: 'revisar',
    keywords: ['analise', 'revisar', 'melhorar', 'validar', 'erro', 'bug', 'risco', 'decidir']
  }
];

export const DECISION_AGENT = {
  id: 'decision',
  name: 'Decision Agent',
  shortName: 'DECISION',
  specialty: 'Consolida os subagentes, resolve conflitos e entrega recomendacao final.'
};

export const DECISION_ROOM_AGENTS = [
  AGENT_TEAM.find(agent => agent.id === 'architect'),
  AGENT_TEAM.find(agent => agent.id === 'security'),
  AGENT_TEAM.find(agent => agent.id === 'critic')
].filter(Boolean);

export function routeDecisionRoom() {
  return [...DECISION_ROOM_AGENTS];
}

export function routeAgentTeam(userInput, options = {}) {
  const normalized = normalize(userInput);
  const selected = new Map();

  for (const agent of AGENT_TEAM) {
    if (agent.keywords.some(keyword => normalized.includes(normalize(keyword)))) {
      selected.set(agent.id, agent);
    }
  }

  selected.set('architect', AGENT_TEAM.find(agent => agent.id === 'architect'));
  selected.set('security', AGENT_TEAM.find(agent => agent.id === 'security'));
  selected.set('critic', AGENT_TEAM.find(agent => agent.id === 'critic'));

  const maxAgents = clampInteger(options.maxAgents ?? 5, 3, AGENT_TEAM.length);
  return [...selected.values()].filter(Boolean).slice(0, maxAgents);
}

export function buildSubagentSystemPrompt(agent) {
  return [
    `Voce e ${agent.name}, um subagente especializado do Nautilus.`,
    `Especialidade: ${agent.specialty}`,
    'Voce nao executa ferramentas diretamente nesta versao. Sua funcao e analisar, votar e orientar a decisao central do Nautilus.',
    'Seja tecnico, curto e acionavel. Responda em portugues do Brasil.',
    'Use exatamente este formato:',
    'DECISAO: executar | pedir_confirmacao | nao_executar | pesquisar_mais | revisar',
    'CONFIANCA: numero de 0 a 100',
    'RISCO: baixo | medio | alto',
    'ANALISE: uma analise objetiva em ate 5 linhas',
    'PROXIMO_PASSO: uma acao recomendada'
  ].join('\n');
}

export function buildDecisionSystemPrompt() {
  return [
    `Voce e ${DECISION_AGENT.name}, o subagente final do Nautilus.`,
    `Especialidade: ${DECISION_AGENT.specialty}`,
    'Consolide os votos dos subagentes, resolva conflitos e entregue a decisao final.',
    'Nao invente execucoes de tool. Se precisar executar algo sensivel, recomende confirmacao ou execucao central pelo Nautilus.',
    'Responda em portugues do Brasil com este formato:',
    'DECISAO FINAL: frase direta',
    'RISCO: baixo | medio | alto',
    'CONFIANCA: numero de 0 a 100',
    'AGENTES CONSULTADOS: lista curta',
    'MOTIVO: explicacao objetiva',
    'PROXIMOS PASSOS: lista curta'
  ].join('\n');
}

export function buildDecisionRoomSubagentPrompt(agent) {
  return [
    `Voce e ${agent.shortName} na Decision Room do Nautilus.`,
    `Especialidade: ${agent.specialty}`,
    'Analise a pergunta de decisao tecnica. Seja curto e opinativo.',
    'Responda em portugues do Brasil com 2-4 frases objetivas.',
    'Nao use ferramentas. Nao invente dados nao fornecidos.'
  ].join('\n');
}

export function buildDecisionRoomFinalPrompt() {
  return [
    'Voce e DECISION na Decision Room do Nautilus.',
    'Consolide Architect, Security e Critic em uma recomendacao unica.',
    'Responda em portugues do Brasil com este formato:',
    'DECISAO: recomendacao direta em uma frase',
    'RISCO: baixo | medio | alto',
    'MOTIVO: sintese em ate 3 linhas',
    'PROXIMOS PASSOS: lista curta'
  ].join('\n');
}

export function parseAgentVote(text, fallbackVote = 'revisar') {
  const content = String(text || '');
  const decision = matchField(content, 'DECISAO') || fallbackVote;
  const confidence = Number.parseInt(matchField(content, 'CONFIANCA') || '0', 10);
  const risk = matchField(content, 'RISCO') || 'medio';

  return {
    decision: cleanDecision(decision),
    confidence: Number.isFinite(confidence) ? Math.min(100, Math.max(0, confidence)) : 0,
    risk: cleanRisk(risk)
  };
}

export function formatAgentRoster(agents) {
  return agents.map(agent => `${agent.shortName}: ${agent.specialty}`).join('\n');
}

function matchField(content, field) {
  const regex = new RegExp(`^${field}\\s*:\\s*(.+)$`, 'im');
  return content.match(regex)?.[1]?.trim() || null;
}

function cleanDecision(value) {
  const normalized = normalize(value).replace(/\s+/g, '_');
  if (normalized.includes('confirm')) return 'pedir_confirmacao';
  if (normalized.includes('nao')) return 'nao_executar';
  if (normalized.includes('pesquisar')) return 'pesquisar_mais';
  if (normalized.includes('executar')) return 'executar';
  return 'revisar';
}

function cleanRisk(value) {
  const normalized = normalize(value);
  if (normalized.includes('alto')) return 'alto';
  if (normalized.includes('baixo')) return 'baixo';
  return 'medio';
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}
