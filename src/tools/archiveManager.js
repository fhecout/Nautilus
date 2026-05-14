import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureParentDir, pathExists, resolveLocalPath } from './localPaths.js';
import { requireConfirmation } from '../core/safe_mode.js';

const execFileAsync = promisify(execFile);

export const definition = {
  type: 'function',
  function: {
    name: 'manage_archive',
    description:
      'Compacta e extrai arquivos locais em ZIP. Use para zipar pastas/arquivos ou descompactar .zip.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['zip', 'unzip'],
          description: 'zip para compactar, unzip para extrair.'
        },
        inputPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Arquivos/pastas de entrada para compactar.'
        },
        inputPath: {
          type: 'string',
          description: 'Arquivo ZIP de entrada para unzip.'
        },
        outputPath: {
          type: 'string',
          description: 'Arquivo .zip de destino ou pasta de extracao.'
        },
        overwrite: {
          type: 'boolean',
          description: 'Permite sobrescrever destino. Padrao: false.'
        }
      },
      required: ['operation', 'outputPath']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const operation = String(input.operation || '').trim();

  if (operation === 'zip') {
    return await zipFiles(input);
  }

  if (operation === 'unzip') {
    return await unzipFile(input);
  }

  throw new Error(`Operacao de arquivo compactado invalida: ${operation}`);
}

async function zipFiles(input) {
  const sources = Array.isArray(input.inputPaths)
    ? input.inputPaths.map(item => resolveLocalPath(item))
    : input.inputPath
      ? [resolveLocalPath(input.inputPath)]
      : [];
  if (sources.length === 0) throw new Error('Informe inputPaths para compactar.');

  const output = resolveLocalPath(input.outputPath);
  const outputExists = await pathExists(output);
  if (outputExists && !input.overwrite) {
    throw new Error(`Arquivo ZIP ja existe. Use overwrite=true para sobrescrever: ${output}`);
  }

  if (outputExists) {
    const confirmation = requireConfirmation(
      {
        summary: `sobrescrever o arquivo ZIP ${output}`,
        targets: [output],
        risk: 'o ZIP atual sera substituido.',
        confirmationPhrase: 'SIM, SOBRESCREVER'
      },
      input
    );
    if (confirmation) return confirmation;
  }

  await ensureParentDir(output);
  const sourceList = sources.map(item => `'${escapePowerShell(item)}'`).join(',');
  const command = [
    `$sources = @(${sourceList});`,
    `Compress-Archive -LiteralPath $sources -DestinationPath '${escapePowerShell(output)}' -Force`
  ].join(' ');

  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
    windowsHide: true,
    timeout: 120000
  });

  return {
    directReturn: true,
    finalAnswer: `Arquivo compactado criado:\nDestino: ${output}\nItens: ${sources.join('; ')}`
  };
}

async function unzipFile(input) {
  const source = resolveLocalPath(input.inputPath);
  const output = resolveLocalPath(input.outputPath);
  const outputExists = await pathExists(output);
  if (outputExists && !input.overwrite) {
    throw new Error(`Destino ja existe. Use overwrite=true para extrair mesmo assim: ${output}`);
  }

  if (outputExists) {
    const confirmation = requireConfirmation(
      {
        summary: `extrair ZIP sobre destino existente ${output}`,
        targets: [source, output],
        risk: 'arquivos existentes na pasta de destino podem ser substituidos.',
        confirmationPhrase: 'SIM, SOBRESCREVER'
      },
      input
    );
    if (confirmation) return confirmation;
  }

  const command = [
    `Expand-Archive -LiteralPath '${escapePowerShell(source)}' -DestinationPath '${escapePowerShell(output)}' -Force`
  ].join(' ');

  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
    windowsHide: true,
    timeout: 120000
  });

  return {
    directReturn: true,
    finalAnswer: `Arquivo extraido:\nOrigem: ${source}\nDestino: ${output}`
  };
}

function escapePowerShell(value) {
  return String(value).replace(/'/g, "''");
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return { operation: 'zip', inputPaths: [args], outputPath: `${path.basename(args)}.zip` };
    }
  }

  return args && typeof args === 'object' ? args : {};
}
