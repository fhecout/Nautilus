export const SAFE_MODE_CONFIRM_FIELD = '__safeModeConfirmed';

const DANGEROUS_COMMAND_PATTERNS = [
  /\bremove-item\b/i,
  /\brm\s+(-|\/)/i,
  /\bdel\s+/i,
  /\berase\s+/i,
  /\brmdir\b/i,
  /\brd\s+/i,
  /\bformat\b/i,
  /\bshutdown\b/i,
  /\breg\s+delete\b/i
];

export function isSafeModeEnabled() {
  return process.env.SAFE_MODE !== 'false';
}

export function requireConfirmation(details, args = {}) {
  if (!isSafeModeEnabled() || args[SAFE_MODE_CONFIRM_FIELD] === true) {
    return null;
  }

  return buildConfirmation(details);
}

export function buildConfirmation(details) {
  const phrase = details.confirmationPhrase || 'SIM, EXECUTAR';
  const lines = [
    'Modo seguro: preciso de confirmacao antes de continuar.',
    '',
    `O que sera feito: ${details.summary}`,
    details.targets?.length ? `Afetados: ${details.targets.join('; ')}` : null,
    `Risco: ${details.risk}`,
    '',
    `Confirme digitando exatamente: ${phrase}`
  ].filter(Boolean);

  return {
    directReturn: true,
    needsConfirmation: true,
    confirmationPhrase: phrase,
    finalAnswer: lines.join('\n'),
    safeMode: {
      summary: details.summary,
      targets: details.targets || [],
      risk: details.risk,
      confirmationPhrase: phrase
    }
  };
}

export function withSafeModeConfirmation(args = {}) {
  if (typeof args === 'string') {
    try {
      return {
        ...JSON.parse(args),
        [SAFE_MODE_CONFIRM_FIELD]: true
      };
    } catch {
      return {
        value: args,
        [SAFE_MODE_CONFIRM_FIELD]: true
      };
    }
  }

  return {
    ...args,
    [SAFE_MODE_CONFIRM_FIELD]: true
  };
}

export function analyzeSqlSafety(sql) {
  const statements = splitSqlStatements(sql);
  const findings = [];

  for (const statement of statements) {
    const normalized = normalizeSql(statement);
    if (!normalized) continue;

    if (/^drop\b/.test(normalized)) {
      findings.push({ type: 'DROP', statement });
      continue;
    }

    if (/^truncate\b/.test(normalized)) {
      findings.push({ type: 'TRUNCATE', statement });
      continue;
    }

    if (/^alter\b/.test(normalized)) {
      findings.push({ type: 'ALTER', statement });
      continue;
    }

    if (/^delete\b/.test(normalized)) {
      findings.push({ type: 'DELETE', statement });
      continue;
    }

    if (/^update\b/.test(normalized) && !/\bwhere\b/.test(normalized)) {
      findings.push({ type: 'UPDATE sem WHERE', statement });
    }
  }

  return {
    dangerous: findings.length > 0,
    findings
  };
}

export function analyzeCommandSafety(command) {
  const text = String(command || '');
  const findings = DANGEROUS_COMMAND_PATTERNS
    .filter(pattern => pattern.test(text))
    .map(pattern => ({ pattern: pattern.toString(), command: text }));

  return {
    dangerous: findings.length > 0,
    findings
  };
}

export function isOverwriteDangerous(overwrite, targetExists) {
  return Boolean(overwrite && targetExists);
}

export function isBulkMoveDangerous(count) {
  return Number(count) >= 5;
}

function splitSqlStatements(sql) {
  return String(sql || '')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

function normalizeSql(statement) {
  return statement
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
