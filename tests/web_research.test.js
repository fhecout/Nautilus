import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '../src/core/Agent.js';

test('detecta pesquisa web explicita e prepara leitura de fontes', () => {
  const agent = new Agent('modelo-teste');
  const request = agent.resolveWebResearchRequest(
    'Pesquise na internet e me passe informacoes sobre energia solar no Brasil'
  );

  assert.equal(request.query, 'energia solar no Brasil');
  assert.equal(request.searchType, 'web');
  assert.equal(request.shouldScrape, true);
});

test('mantem busca simples como lista de links quando pedido for so resultados', () => {
  const agent = new Agent('modelo-teste');
  const request = agent.resolveWebResearchRequest('Busque no Google links sobre React 19');

  assert.equal(request.query, 'React 19');
  assert.equal(request.shouldScrape, false);
});

test('noticias acionam pesquisa sem depender de tool call do modelo', () => {
  const agent = new Agent('modelo-teste');
  const request = agent.resolveWebResearchRequest('Quais as ultimas noticias sobre a OpenAI?');

  assert.match(request.query, /OpenAI/i);
  assert.equal(request.searchType, 'news');
  assert.equal(request.shouldScrape, true);
});

test('nao trata busca em memoria como pesquisa web', () => {
  const agent = new Agent('modelo-teste');
  const request = agent.resolveWebResearchRequest('Procure nas memorias por contrato');

  assert.equal(request, null);
});
