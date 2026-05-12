import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.tsv',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.html',
  '.css',
  '.scss',
  '.xml',
  '.yaml',
  '.yml',
  '.sql',
  '.log'
]);

export function resolveLocalPath(inputPath, baseDir = process.cwd()) {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Caminho nao informado.');
  }

  let normalized = inputPath.trim().replace(/^['"]|['"]$/g, '');
  if (normalized === '~') normalized = os.homedir();
  if (normalized.startsWith('~\\') || normalized.startsWith('~/')) {
    normalized = path.join(os.homedir(), normalized.slice(2));
  }

  return path.resolve(baseDir, normalized);
}

export async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getFileInfo(filePath) {
  const stats = await fs.stat(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    extension: path.extname(filePath).toLowerCase(),
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    createdAt: stats.birthtime.toISOString()
  };
}

export function isLikelyTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

