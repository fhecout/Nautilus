import * as systemTime from './systemTime.js';
import * as webScraper from './webScraper.js';
import * as googleSearch from './googleSearch.js';
import * as pdfReader from './pdfReader.js';
import * as gmailReader from './gmailReader.js';
import * as fileManager from './fileManager.js';
import * as fileSearch from './fileSearch.js';
import * as fileConverter from './fileConverter.js';
import * as archiveManager from './archiveManager.js';
import * as sqliteManager from './sqliteManager.js';
import * as memoryManager from './memoryManager.js';

// Adicione novas tools neste array conforme o projeto cresce
export const availableTools = [
  systemTime,
  webScraper,
  googleSearch,
  pdfReader,
  gmailReader,
  fileManager,
  fileSearch,
  fileConverter,
  archiveManager,
  sqliteManager,
  memoryManager,
];

// Extrai apenas as definições (schemas) para enviar ao modelo
export const getToolDefinitions = (toolNames = null) => {
  if (!Array.isArray(toolNames) || toolNames.length === 0) {
    return availableTools.map(tool => tool.definition);
  }

  const allowed = new Set(toolNames);
  return availableTools
    .filter(tool => allowed.has(tool.definition.function.name))
    .map(tool => tool.definition);
};

// Encontra a tool pelo nome e executa a função principal dela
export const executeTool = async (name, args) => {
  const tool = availableTools.find(t => t.definition.function.name === name);
  if (!tool) {
    throw new Error(`Tool '${name}' não encontrada no sistema.`);
  }
  return await tool.execute(args);
};
