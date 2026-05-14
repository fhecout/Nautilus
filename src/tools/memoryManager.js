import {
  deleteMemory,
  formatMemories,
  listMemories,
  saveMemory,
  searchMemories
} from '../core/memory.js';

export const definition = {
  type: 'function',
  function: {
    name: 'manage_memory',
    description:
      'Salva, busca, lista e apaga memorias persistentes do assistente. Use para lembrar informacoes importantes entre sessoes.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['save', 'search', 'list', 'delete'],
          description: 'Operacao de memoria.'
        },
        text: {
          type: 'string',
          description: 'Texto a salvar como memoria.'
        },
        query: {
          type: 'string',
          description: 'Palavra-chave para buscar ou apagar memoria.'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags opcionais da memoria.'
        }
      },
      required: ['operation']
    }
  }
};

export async function execute(args) {
  const input = normalizeArgs(args);
  const operation = String(input.operation || '').trim();

  if (operation === 'save') {
    const memory = await saveMemory(input.text, { tags: input.tags });
    return direct(`Memoria salva:\n- ${memory.id}: ${memory.text}`);
  }

  if (operation === 'search') {
    const memories = await searchMemories(input.query || input.text || '');
    return direct(formatMemories(memories));
  }

  if (operation === 'list') {
    const memories = await listMemories();
    return direct(formatMemories(memories));
  }

  if (operation === 'delete') {
    const deleted = await deleteMemory(input.query || input.text || '');
    return direct(deleted.length ? `Memoria(s) apagada(s):\n${formatMemories(deleted)}` : 'Nenhuma memoria encontrada para apagar.');
  }

  throw new Error(`Operacao de memoria invalida: ${operation}`);
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
      return { operation: 'search', query: args };
    }
  }

  return args && typeof args === 'object' ? args : {};
}

