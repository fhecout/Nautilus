import { formatSystemSnapshot, getSystemSnapshot } from '../core/systemInfo.js';

export const definition = {
  type: 'function',
  function: {
    name: 'get_system_status',
    description:
      'Mostra status do computador local: uso de CPU, memoria RAM, armazenamento por disco, GPU e temperaturas quando o Windows disponibilizar sensores.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
};

export async function execute() {
  const snapshot = await getSystemSnapshot();
  return {
    directReturn: true,
    finalAnswer: formatSystemSnapshot(snapshot),
    snapshot
  };
}

