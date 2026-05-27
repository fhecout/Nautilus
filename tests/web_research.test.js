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

test('noticias usam pesquisa web comum e nao google news', () => {
  const agent = new Agent('modelo-teste');
  const request = agent.resolveWebResearchRequest('Quais as ultimas noticias sobre a OpenAI?');

  assert.match(request.query, /OpenAI/i);
  assert.equal(request.searchType, 'web');
  assert.equal(request.shouldScrape, true);
});

test('pedido generico de pesquisa pede escopo antes de agir', () => {
  const agent = new Agent('modelo-teste');
  const request = agent.resolveAmbiguousSearchRequest('Consegue pesquisar sobre Neymar?');

  assert.equal(request.query, 'Neymar');
  assert.equal(request.originalInput, 'Consegue pesquisar sobre Neymar?');
});

test('bitcoin vai direto para web por ser assunto atual', () => {
  const agent = new Agent('modelo-teste');
  const request = agent.resolveWebResearchRequest('Quanto esta o Bitcoin agora?');

  assert.match(request.query, /Bitcoin/i);
  assert.equal(request.searchType, 'web');
  assert.equal(request.shouldScrape, true);
});

test('nao trata busca em memoria como pesquisa web', () => {
  const agent = new Agent('modelo-teste');
  const request = agent.resolveWebResearchRequest('Procure nas memorias por contrato');

  assert.equal(request, null);
});

test('resultado inicial de pesquisa web nao mostra URLs', async () => {
  const agent = new Agent('modelo-teste');
  agent.executeObservedTool = async () => ({
    results: [
      {
        title: 'Neymar - Wikipedia',
        url: 'https://pt.wikipedia.org/wiki/Neymar',
        source: 'pt.wikipedia.org'
      },
      {
        title: 'Neymar News',
        url: 'https://www.espn.com.br/futebol/neymar',
        source: 'espn.com.br'
      }
    ]
  });

  let output = '';
  await agent.openWebResearch({
    query: 'Neymar',
    searchType: 'web',
    shouldScrape: false,
    maxResults: 5,
    maxPagesToRead: 3
  }, 'Pesquise Neymar', text => {
    output += text;
  });

  assert.match(output, /Wikipedia/);
  assert.match(output, /ESPN/);
  assert.doesNotMatch(output, /https?:\/\//);
  assert.doesNotMatch(output, /www\./);
});
