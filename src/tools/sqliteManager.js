import { DatabaseSync } from 'node:sqlite';
import { ensureParentDir, resolveLocalPath } from './localPaths.js';
import { analyzeSqlSafety, requireConfirmation } from '../core/safe_mode.js';

const MAX_ROWS = 100;

export const definition = {
  type: 'function',
  function: {
    name: 'manage_sqlite',
    description:
      'Cria, consulta e edita bancos SQLite locais. Use para criar banco .sqlite/.db, executar SQL, listar tabelas, ver schema e consultar dados.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['query', 'exec', 'schema', 'tables'],
          description:
            'query para SELECT/PRAGMA com retorno; exec para CREATE/INSERT/UPDATE/DELETE; schema para estrutura; tables para listar tabelas.'
        },
        databasePath: {
          type: 'string',
          description: 'Caminho do arquivo .sqlite ou .db.'
        },
        sql: {
          type: 'string',
          description: 'SQL a executar.'
        },
        params: {
          type: 'array',
          items: {},
          description: 'Parametros posicionais opcionais para SQL.'
        },
        maxRows: {
          type: 'integer',
          description: 'Maximo de linhas retornadas em query. Padrao 50, limite 100.'
        }
      },
      required: ['operation', 'databasePath']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const operation = String(input.operation || '').trim();
  const dbPath = resolveLocalPath(input.databasePath);
  await ensureParentDir(dbPath);

  if (!['tables', 'schema', 'query', 'exec'].includes(operation)) {
    throw new Error(`Operacao SQLite invalida: ${operation}`);
  }

  const sql = operation === 'query' || operation === 'exec' ? requireSql(input.sql) : '';
  if (operation === 'query') assertReadOnly(sql);

  if (operation === 'exec') {
    const analysis = analyzeSqlSafety(sql);
    if (analysis.dangerous) {
      const confirmation = requireConfirmation(
        {
          summary: `executar SQL destrutivo em ${dbPath}`,
          targets: analysis.findings.map(finding => `${finding.type}: ${finding.statement}`),
          risk: 'o comando pode apagar dados, alterar estrutura do banco ou modificar muitas linhas.',
          confirmationPhrase: 'SIM, EXECUTAR SQL'
        },
        input
      );
      if (confirmation) return confirmation;
    }
  }

  const limit = clampInteger(input.maxRows ?? 50, 1, MAX_ROWS);
  const result = runNativeSqlite({
    dbPath,
    operation,
    sql,
    params: normalizeParams(input.params),
    limit
  });

  if (operation === 'exec') {
    return direct(`SQL executado em: ${dbPath}`);
  }

  const title =
    operation === 'tables' ? 'Tabelas' : operation === 'schema' ? 'Schema' : `Resultado (${result.rows.length})`;
  return direct(formatRows(title, result.rows));
}

function assertReadOnly(sql) {
  const normalized = sql.trim().toLowerCase();
  if (!/^(select|pragma|with)\b/.test(normalized)) {
    throw new Error('Use operation=exec para SQL que altera o banco.');
  }
}

function requireSql(sql) {
  const value = String(sql || '').trim();
  if (!value) throw new Error('SQL nao informado.');
  return value;
}

function normalizeParams(params) {
  return Array.isArray(params) ? params : [];
}

function runNativeSqlite({ dbPath, operation, sql, params, limit }) {
  const db = new DatabaseSync(dbPath);
  try {
    let rows = [];
    if (operation === 'tables') {
      const stmt = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
      rows = stmt.all();
    } else if (operation === 'schema') {
      const stmt = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");
      rows = stmt.all();
    } else if (operation === 'query') {
      const stmt = db.prepare(sql);
      rows = stmt.all(...params).slice(0, limit);
    } else if (operation === 'exec') {
      if (params && params.length > 0) {
        const stmt = db.prepare(sql);
        stmt.run(...params);
      } else {
        db.exec(sql);
      }
      rows = [];
    } else {
      throw new Error(`Operacao invalida: ${operation}`);
    }
    return { rows };
  } finally {
    db.close();
  }
}

function formatRows(title, rows) {
  if (!rows || rows.length === 0) return `${title}: nenhum resultado.`;
  return `${title}:\n${JSON.stringify(rows, null, 2)}`;
}

function direct(finalAnswer) {
  return {
    directReturn: true,
    finalAnswer
  };
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      throw new Error('Argumentos invalidos para manage_sqlite.');
    }
  }

  return args && typeof args === 'object' ? args : {};
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}
