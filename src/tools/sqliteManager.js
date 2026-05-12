import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureParentDir, resolveLocalPath } from './localPaths.js';

const MAX_ROWS = 100;
const execFileAsync = promisify(execFile);

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

  const limit = clampInteger(input.maxRows ?? 50, 1, MAX_ROWS);
  const result = await runPythonSqlite({
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

async function runPythonSqlite({ dbPath, operation, sql, params, limit }) {
  const script = `
import json
import sqlite3
import sys

db_path = sys.argv[1]
operation = sys.argv[2]
sql = sys.argv[3]
params = json.loads(sys.argv[4])
limit = int(sys.argv[5])

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
try:
    cur = conn.cursor()
    if operation == "tables":
        cur.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
        rows = [dict(row) for row in cur.fetchall()]
    elif operation == "schema":
        cur.execute("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
        rows = [dict(row) for row in cur.fetchall()]
    elif operation == "query":
        cur.execute(sql, params)
        rows = [dict(row) for row in cur.fetchmany(limit)]
    elif operation == "exec":
        if params:
            cur.execute(sql, params)
        else:
            cur.executescript(sql)
        conn.commit()
        rows = []
    else:
        raise ValueError("operacao invalida")
    print(json.dumps({"rows": rows}, ensure_ascii=False))
finally:
    conn.close()
`;

  const { stdout } = await execFileAsync('python', ['-c', script, dbPath, operation, sql, JSON.stringify(params), String(limit)], {
    windowsHide: true,
    timeout: 60000,
    maxBuffer: 1024 * 1024 * 5
  });

  return JSON.parse(stdout);
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
