import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureParentDir, pathExists, resolveLocalPath } from './localPaths.js';

const execFileAsync = promisify(execFile);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.heic']);
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.log']);

export const definition = {
  type: 'function',
  function: {
    name: 'convert_file',
    description:
      'Converte arquivos locais entre formatos comuns. Usa ImageMagick para imagens/PDF: JPG/JPEG/PNG/WEBP/GIF/BMP/TIFF/PDF. Tambem converte PDF para TXT e texto para PDF simples.',
    parameters: {
      type: 'object',
      properties: {
        inputPath: {
          type: 'string',
          description: 'Arquivo de origem.'
        },
        outputPath: {
          type: 'string',
          description: 'Arquivo de destino. Se omitido, cria ao lado do original com a nova extensao.'
        },
        outputFormat: {
          type: 'string',
          description: 'Formato de saida, exemplo: png, jpg, jpeg, webp, pdf, txt.'
        },
        overwrite: {
          type: 'boolean',
          description: 'Permite sobrescrever arquivo de destino. Padrao: false.'
        }
      },
      required: ['inputPath', 'outputFormat']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const source = resolveLocalPath(input.inputPath);
  const outputFormat = normalizeFormat(input.outputFormat);
  if (!outputFormat) throw new Error('Formato de saida nao informado.');

  const target = input.outputPath
    ? resolveLocalPath(input.outputPath)
    : source.replace(/\.[^.\\/:]+$/, '') + `.${outputFormat}`;

  if ((await pathExists(target)) && !input.overwrite) {
    throw new Error(`Arquivo de destino ja existe. Use overwrite=true para sobrescrever: ${target}`);
  }

  await ensureParentDir(target);

  const sourceExt = path.extname(source).toLowerCase();
  const targetExt = path.extname(target).toLowerCase() || `.${outputFormat}`;

  if (sourceExt === '.pdf' && targetExt === '.txt') {
    await convertPdfToText(source, target);
  } else if (TEXT_EXTENSIONS.has(sourceExt) && targetExt === '.pdf') {
    await convertTextToPdf(source, target);
  } else if (IMAGE_EXTENSIONS.has(sourceExt) || IMAGE_EXTENSIONS.has(targetExt) || sourceExt === '.pdf' || targetExt === '.pdf') {
    await convertWithImageMagick(source, target);
  } else if (TEXT_EXTENSIONS.has(sourceExt) && TEXT_EXTENSIONS.has(targetExt)) {
    await fs.copyFile(source, target);
  } else {
    throw new Error(`Conversao ainda nao suportada: ${sourceExt || '(sem extensao)'} -> ${targetExt}`);
  }

  return {
    directReturn: true,
    finalAnswer: `Arquivo convertido:\nOrigem: ${source}\nDestino: ${target}`
  };
}

async function convertWithImageMagick(source, target) {
  await execFileAsync('magick', [source, target], {
    windowsHide: true,
    timeout: 120000
  });
}

async function convertPdfToText(source, target) {
  const { PDFParse } = await import('pdf-parse');
  const buffer = await fs.readFile(source);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await fs.writeFile(target, result.text || '', 'utf8');
  await parser.destroy();
}

async function convertTextToPdf(source, target) {
  const PDFDocument = (await import('pdfkit')).default;
  const text = await fs.readFile(source, 'utf8');

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', async () => {
      try {
        await fs.writeFile(target, Buffer.concat(chunks));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    doc.fontSize(12).text(text, { align: 'left', lineGap: 4 });
    doc.end();
  });
}

function normalizeFormat(value) {
  return String(value || '').trim().toLowerCase().replace(/^\./, '');
}

function normalizeArgs(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch {
      throw new Error('Argumentos invalidos para convert_file.');
    }
  }

  return args && typeof args === 'object' ? args : {};
}

