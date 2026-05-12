import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import {
  ensureParentDir,
  getFileInfo,
  isLikelyTextFile,
  pathExists,
  resolveLocalPath
} from './localPaths.js';

const MAX_READ_CHARS = 80000;
const MAX_LIST_ITEMS = 200;

export const definition = {
  type: 'function',
  function: {
    name: 'manage_files',
    description:
      'Le, lista, cria e edita arquivos locais do PC. Use para criar TXT/MD/JSON/CSV/SQL, ler arquivos de texto, substituir texto, adicionar conteudo, criar pastas, obter informacoes e criar PDF simples a partir de texto.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['info', 'list', 'read', 'write', 'append', 'replace', 'mkdir', 'create_pdf'],
          description: 'Operacao desejada.'
        },
        path: {
          type: 'string',
          description: 'Caminho do arquivo ou pasta. Pode ser absoluto ou relativo ao projeto.'
        },
        content: {
          type: 'string',
          description: 'Conteudo para write, append ou create_pdf.'
        },
        search: {
          type: 'string',
          description: 'Texto exato a localizar na operacao replace.'
        },
        replacement: {
          type: 'string',
          description: 'Texto substituto na operacao replace.'
        },
        overwrite: {
          type: 'boolean',
          description: 'Permite sobrescrever arquivo existente em write/create_pdf. Padrao: false.'
        }
      },
      required: ['operation', 'path']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const operation = String(input.operation || '').trim();
  const targetPath = resolveLocalPath(input.path);

  switch (operation) {
    case 'info':
      return direct(`Informacoes do caminho:\n${formatInfo(await getFileInfo(targetPath))}`);
    case 'list':
      return direct(await listDirectory(targetPath));
    case 'read':
      return await readFile(targetPath);
    case 'write':
      return await writeTextFile(targetPath, input.content, Boolean(input.overwrite));
    case 'append':
      return await appendTextFile(targetPath, input.content);
    case 'replace':
      return await replaceInFile(targetPath, input.search, input.replacement);
    case 'mkdir':
      await fs.mkdir(targetPath, { recursive: true });
      return direct(`Pasta criada/confirmada: ${targetPath}`);
    case 'create_pdf':
      return await createPdf(targetPath, input.content, Boolean(input.overwrite));
    default:
      throw new Error(`Operacao de arquivo invalida: ${operation}`);
  }
}

async function listDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const visible = entries.slice(0, MAX_LIST_ITEMS);
  const lines = visible.map(entry => {
    const type = entry.isDirectory() ? '[pasta]' : '[arquivo]';
    return `${type} ${entry.name}`;
  });

  const suffix =
    entries.length > visible.length ? `\n... mais ${entries.length - visible.length} item(ns).` : '';
  return `Conteudo de ${dirPath}:\n${lines.join('\n') || '(vazio)'}${suffix}`;
}

async function readFile(filePath) {
  const info = await getFileInfo(filePath);
  if (info.isDirectory) {
    return direct(await listDirectory(filePath));
  }

  if (!isLikelyTextFile(filePath)) {
    return direct(
      [
        `Arquivo encontrado: ${filePath}`,
        `Tamanho: ${info.sizeBytes} bytes`,
        'Esse tipo parece binario. Use convert_file, read_pdf ou outra tool especifica para analisar/converter.'
      ].join('\n')
    );
  }

  const content = await fs.readFile(filePath, 'utf8');
  const clipped = content.length > MAX_READ_CHARS;
  const text = clipped ? content.slice(0, MAX_READ_CHARS) : content;

  return {
    directReturn: false,
    finalAnswer: `Li o arquivo: ${filePath}`,
    modelInput: [
      'Conteudo de arquivo local autorizado pelo usuario.',
      `Caminho: ${filePath}`,
      clipped ? `Aviso: conteudo limitado aos primeiros ${MAX_READ_CHARS} caracteres.` : null,
      'Responda ao pedido do usuario usando o conteudo abaixo.',
      text
    ]
      .filter(Boolean)
      .join('\n\n'),
    file: info
  };
}

async function writeTextFile(filePath, content, overwrite) {
  if ((await pathExists(filePath)) && !overwrite) {
    throw new Error(`Arquivo ja existe. Use overwrite=true para sobrescrever: ${filePath}`);
  }

  await ensureParentDir(filePath);
  await fs.writeFile(filePath, String(content || ''), 'utf8');
  return direct(`Arquivo criado: ${filePath}`);
}

async function appendTextFile(filePath, content) {
  await ensureParentDir(filePath);
  await fs.appendFile(filePath, String(content || ''), 'utf8');
  return direct(`Conteudo adicionado ao arquivo: ${filePath}`);
}

async function replaceInFile(filePath, search, replacement) {
  if (!search) throw new Error('Texto search nao informado para replace.');

  const original = await fs.readFile(filePath, 'utf8');
  const occurrences = original.split(String(search)).length - 1;
  if (occurrences === 0) {
    return direct(`Nao encontrei o texto informado em: ${filePath}`);
  }

  const updated = original.split(String(search)).join(String(replacement || ''));
  await fs.writeFile(filePath, updated, 'utf8');
  return direct(`Arquivo editado: ${filePath}\nSubstituicoes feitas: ${occurrences}`);
}

async function createPdf(filePath, content, overwrite) {
  const pdfPath = path.extname(filePath).toLowerCase() === '.pdf' ? filePath : `${filePath}.pdf`;
  if ((await pathExists(pdfPath)) && !overwrite) {
    throw new Error(`PDF ja existe. Use overwrite=true para sobrescrever: ${pdfPath}`);
  }

  await ensureParentDir(pdfPath);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', async () => {
      try {
        await fs.writeFile(pdfPath, Buffer.concat(chunks));
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    doc.fontSize(12).text(String(content || ''), {
      align: 'left',
      lineGap: 4
    });
    doc.end();
  });

  return direct(`PDF criado: ${pdfPath}`);
}

function direct(finalAnswer) {
  return {
    directReturn: true,
    finalAnswer
  };
}

function formatInfo(info) {
  return [
    `Caminho: ${info.path}`,
    `Nome: ${info.name}`,
    `Tipo: ${info.isDirectory ? 'pasta' : 'arquivo'}`,
    `Extensao: ${info.extension || '(nenhuma)'}`,
    `Tamanho: ${info.sizeBytes} bytes`,
    `Criado em: ${info.createdAt}`,
    `Modificado em: ${info.modifiedAt}`
  ].join('\n');
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      return { operation: 'read', path: args };
    }
  }

  return args && typeof args === 'object' ? args : {};
}

