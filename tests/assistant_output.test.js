import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAssistantOutput } from '../src/core/Agent.js';

test('converte JSON interno em fala natural', () => {
  const output = normalizeAssistantOutput(
    '{"operation":"save","query":"status","tags":["conversa"],"text":"Estou funcionando bem, senhor."}'
  );

  assert.equal(output, 'Estou funcionando bem, senhor.');
});

test('remove formato estruturado de decisao da resposta visivel', () => {
  const output = normalizeAssistantOutput(`
DECISAO: executar com cautela
RISCO: baixo
CONFIANCA: 91
MOTIVO: o pedido e reversivel.
PROXIMOS PASSOS: seguir pela rota mais simples.
`);

  assert.match(output, /^Minha recomendacao: executar com cautela/);
  assert.doesNotMatch(output, /^DECISAO:/m);
});
