import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableTools } from '../tools/index.js';
import { isSafeModeEnabled } from './safe_mode.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, '..', '..');
const LARGE_FILE_BYTES = Number.parseInt(process.env.RADAR_LARGE_FILE_KB || '500', 10) * 1024;
const TODO_AGE_DAYS = Number.parseInt(process.env.RADAR_TODO_AGE_DAYS || '90', 10);

const SCAN_IGNORE = new Set([
  'node_modules',
  '.git',
  'dist',
  'data',
  '.secrets',
  'logs',
  'package-lock.json'
]);

const TOOL_TEST_HINTS = {
  manage_memory: ['memory'],
  manage_files: ['file', 'safe_mode'],
  manage_sqlite: ['sqlite', 'safe_mode'],
  read_gmail: ['gmail'],
  get_system_status: ['system']
};

export function scanProject(options = {}) {
  const root = options.root || PROJECT_ROOT;
  const issues = [];

  issues.push(...findLargeFiles(root));
  issues.push(...findToolsWithoutTests(root));
  issues.push(...findUnusedDependencies(root));
  issues.push(...findStaleTodos(root));
  issues.push(...findSafeModeGaps());

  const score = issues.reduce((sum, item) => sum + severityWeight(item.severity), 0);
  return {
    scannedAt: new Date().toISOString(),
    root,
    issueCount: issues.length,
    score,
    level: score >= 12 ? 'critical' : score >= 6 ? 'warning' : score > 0 ? 'info' : 'clear',
    issues: issues.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
  };
}

export function formatRadarReport(scan) {
  if (!scan.issues.length) {
    return 'Radar: nenhum problema detectado no momento.';
  }
  const lines = scan.issues.map(
    issue => `- [${issue.severity.toUpperCase()}] ${issue.message}${issue.path ? ` (${issue.path})` : ''}`
  );
  return `Detectei possiveis problemas (${scan.issueCount}):\n${lines.join('\n')}`;
}

function findLargeFiles(root) {
  const issues = [];
  walkFiles(path.join(root, 'src'), filePath => {
    const stat = fs.statSync(filePath);
    if (stat.size >= LARGE_FILE_BYTES) {
      const kb = Math.round(stat.size / 1024);
      issues.push({
        id: `large-${filePath}`,
        category: 'large_file',
        severity: kb > 1024 ? 'high' : 'medium',
        message: `Arquivo grande demais (${kb} KB)`,
        path: path.relative(root, filePath)
      });
    }
  });
  return issues.slice(0, 10);
}

function findToolsWithoutTests(root) {
  const testDir = path.join(root, 'tests');
  const testContent = fs.existsSync(testDir)
    ? fs.readdirSync(testDir).flatMap(file => {
        try {
          return [fs.readFileSync(path.join(testDir, file), 'utf8')];
        } catch {
          return [];
        }
      }).join('\n')
    : '';

  return availableTools
    .map(tool => tool.definition.function.name)
    .filter(name => {
      const hints = TOOL_TEST_HINTS[name] || [name.replace(/^manage_/, '').replace(/_/g, '')];
      return !hints.some(hint => testContent.toLowerCase().includes(hint.toLowerCase()));
    })
    .map(name => ({
      id: `no-test-${name}`,
      category: 'missing_test',
      severity: 'medium',
      message: `Tool sem teste dedicado: ${name}`,
      path: `tests/*`
    }));
}

function findUnusedDependencies(root) {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  const srcContent = collectSourceText(path.join(root, 'src'));
  const issues = [];

  for (const dep of deps) {
    const importName = dep.startsWith('@') ? dep : dep.split('/')[0];
    if (!srcContent.includes(importName) && !isLikelyTransitiveOrRuntime(dep)) {
      issues.push({
        id: `unused-dep-${dep}`,
        category: 'unused_dependency',
        severity: 'low',
        message: `Dependencia possivelmente sem uso direto: ${dep}`,
        path: 'package.json'
      });
    }
  }
  return issues;
}

function findStaleTodos(root) {
  const issues = [];
  const cutoff = Date.now() - TODO_AGE_DAYS * 24 * 60 * 60 * 1000;

  walkFiles(path.join(root, 'src'), filePath => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!/\b(TODO|FIXME|HACK)\b/i.test(line)) continue;
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        issues.push({
          id: `todo-${filePath}-${index}`,
          category: 'stale_todo',
          severity: 'low',
          message: `TODO antigo na linha ${index + 1}`,
          path: `${path.relative(root, filePath)}:${index + 1}`,
          excerpt: line.trim().slice(0, 120)
        });
      }
    }
  });

  return issues.slice(0, 15);
}

function findSafeModeGaps() {
  if (!isSafeModeEnabled()) return [];

  const issues = [];
  const sensitiveTools = {
    scrape_web_site: 'webScraper.js',
    read_gmail: 'gmailReader.js',
    search_google: 'googleSearch.js',
    find_local_files: 'fileSearch.js'
  };

  for (const [toolName, fileName] of Object.entries(sensitiveTools)) {
    const filePath = path.join(PROJECT_ROOT, 'src', 'tools', fileName);
    if (!fs.existsSync(filePath)) continue;
    const source = fs.readFileSync(filePath, 'utf8');
    const mutates = /\b(write|delete|remove|unlink|rm|DROP|UPDATE|INSERT)\b/i.test(source);
    const hasSafe = source.includes('requireConfirmation');
    if (mutates && !hasSafe) {
      issues.push({
        id: `safe-gap-${toolName}`,
        category: 'safe_mode_gap',
        severity: 'high',
        message: `Safe Mode nao cobre determinada acao em ${toolName}`,
        path: `src/tools/${fileName}`
      });
    }
  }

  return issues;
}

function walkFiles(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SCAN_IGNORE.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, callback);
    else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) callback(fullPath);
  }
}

function collectSourceText(dir) {
  let text = '';
  walkFiles(dir, filePath => {
    text += fs.readFileSync(filePath, 'utf8');
  });
  return text;
}

function isLikelyTransitiveOrRuntime(dep) {
  return ['react', 'react-dom', 'express', 'cors', 'electron', 'vite', 'lucide-react'].includes(dep);
}

function severityWeight(severity) {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}
