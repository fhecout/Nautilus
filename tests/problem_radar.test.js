import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRadarReport, scanProject } from '../src/core/problemRadar.js';

test('scanProject retorna estrutura de radar', () => {
  const scan = scanProject();
  assert.ok(scan.scannedAt);
  assert.ok(['clear', 'info', 'warning', 'critical'].includes(scan.level));
  assert.ok(Array.isArray(scan.issues));
});

test('formatRadarReport lista problemas detectados', () => {
  const text = formatRadarReport({
    issueCount: 1,
    issues: [{ severity: 'medium', message: 'Tool sem teste dedicado: foo', path: 'tests/*' }]
  });
  assert.match(text, /Detectei possiveis problemas/);
  assert.match(text, /Tool sem teste dedicado/);
});
