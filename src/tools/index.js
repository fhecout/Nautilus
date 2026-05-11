import * as systemTime from './systemTime.js';
import * as webScraper from './webScraper.js';
import * as googleSearch from './googleSearch.js';
import * as pdfReader from './pdfReader.js';

// Adicione novas tools neste array conforme o projeto cresce
export const availableTools = [
  systemTime,
  webScraper,
  googleSearch,
  pdfReader,
];

// Extrai apenas as definições (schemas) para enviar ao modelo
export const getToolDefinitions = () => {
  return availableTools.map(tool => tool.definition);
};

// Encontra a tool pelo nome e executa a função principal dela
export const executeTool = async (name, args) => {
  const tool = availableTools.find(t => t.definition.function.name === name);
  if (!tool) {
    throw new Error(`Tool '${name}' não encontrada no sistema.`);
  }
  return await tool.execute(args);
};
