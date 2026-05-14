import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('salva e busca memoria persistente em SQLite', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nautilus-memory-'));
  process.env.MEMORY_DB_PATH = path.join(tempDir, 'memory.sqlite');

  const { saveMemory, searchMemories } = await import('../src/core/memory.js');
  const memory = await saveMemory('meus contratos ficam em D:\\Clientes\\Contracts', {
    tags: ['contratos']
  });
  const found = await searchMemories('contratos');

  assert.equal(found.length, 1);
  assert.equal(found[0].id, memory.id);
  assert.match(found[0].text, /contratos/);
});

test('apaga memoria por palavra-chave', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nautilus-memory-delete-'));
  process.env.MEMORY_DB_PATH = path.join(tempDir, 'memory.sqlite');

  const { deleteMemory, saveMemory, searchMemories } = await import('../src/core/memory.js');
  await saveMemory('minhas notas ficam em D:\\Notas', { tags: ['notas'] });
  const deleted = await deleteMemory('notas');
  const found = await searchMemories('notas');

  assert.equal(deleted.length, 1);
  assert.equal(found.length, 0);
});

test('bloqueia delete de arquivo sem confirmacao', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nautilus-delete-'));
  const filePath = path.join(tempDir, 'danger.txt');
  await fs.writeFile(filePath, 'nao apagar sem confirmacao', 'utf8');

  const { execute } = await import('../src/tools/fileManager.js');
  const result = await execute({ operation: 'delete', path: filePath });

  assert.equal(result.needsConfirmation, true);
  assert.equal(result.confirmationPhrase, 'SIM, APAGAR');
  await assert.doesNotReject(() => fs.access(filePath));
});

test('detecta SQL destrutivo', async () => {
  const { analyzeSqlSafety } = await import('../src/core/safe_mode.js');

  assert.equal(analyzeSqlSafety('DELETE FROM clientes').dangerous, true);
  assert.equal(analyzeSqlSafety('DROP TABLE clientes').dangerous, true);
  assert.equal(analyzeSqlSafety('TRUNCATE TABLE clientes').dangerous, true);
  assert.equal(analyzeSqlSafety('ALTER TABLE clientes ADD COLUMN email TEXT').dangerous, true);
  assert.equal(analyzeSqlSafety('UPDATE clientes SET nome = "x"').dangerous, true);
  assert.equal(analyzeSqlSafety('UPDATE clientes SET nome = "x" WHERE id = 1').dangerous, false);
});

