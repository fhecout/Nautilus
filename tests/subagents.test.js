import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAgentVote, routeAgentTeam, routeDecisionRoom } from '../src/core/subagents.js';

test('roteia subagentes essenciais e especialistas por contexto', () => {
  const agents = routeAgentTeam('Analise este projeto backend e veja riscos de SQL e Gmail.');
  const ids = agents.map(agent => agent.id);

  assert.ok(ids.includes('architect'));
  assert.ok(ids.includes('security'));
  assert.ok(ids.includes('critic'));
  assert.ok(ids.includes('research'));
});

test('parseia voto estruturado de subagente', () => {
  const vote = parseAgentVote(`
DECISAO: pedir_confirmacao
CONFIANCA: 84
RISCO: alto
ANALISE: A acao mexe em arquivos sensiveis.
PROXIMO_PASSO: pedir confirmacao.
`);

  assert.equal(vote.decision, 'pedir_confirmacao');
  assert.equal(vote.confidence, 84);
  assert.equal(vote.risk, 'alto');
});

test('Decision Room usa architect, security e critic', () => {
  const agents = routeDecisionRoom();
  const ids = agents.map(agent => agent.id);
  assert.deepEqual(ids, ['architect', 'security', 'critic']);
});
