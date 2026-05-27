import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILTIN_AUTOMATIONS,
  getAutomation,
  listAutomations,
  shouldRunAutomation
} from '../src/core/automations.js';

test('lista automacoes builtin com metadados', () => {
  const items = listAutomations();
  assert.ok(items.length >= 6);
  assert.ok(items.some(item => item.id === 'morning-briefing'));
  assert.ok(items.some(item => item.id === 'friday-review'));
});

test('retorna automacao por id', () => {
  const automation = getAutomation('health-check');
  assert.equal(automation?.name, 'Health check');
  assert.ok(Array.isArray(automation.steps));
});

test('detecta briefing da manha no horario correto', () => {
  const automation = BUILTIN_AUTOMATIONS.find(item => item.id === 'morning-briefing');
  const fakeNow = new Date('2026-05-27T08:30:00');
  const originalGetHours = Date.prototype.getHours;
  Date.prototype.getHours = () => 8;

  try {
    assert.equal(shouldRunAutomation(automation, { lastRuns: {} }), true);
    assert.equal(
      shouldRunAutomation(automation, { lastRuns: { 'morning-briefing': fakeNow.toISOString() } }),
      false
    );
  } finally {
    Date.prototype.getHours = originalGetHours;
  }
});
