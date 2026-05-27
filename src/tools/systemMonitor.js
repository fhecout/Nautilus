import { getSystemSnapshot } from '../core/systemInfo.js';

export const definition = {
  type: 'function',
  function: {
    name: 'get_system_status',
    description:
      'Retorna telemetria atual do computador: CPU, RAM, temperatura, discos e sistema operacional. Use quando o usuario perguntar sobre desempenho, memoria, armazenamento, temperatura ou status do PC.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
};

export async function execute() {
  const snapshot = await getSystemSnapshot({ includeDeep: true, force: true });
  const primaryDisk = snapshot.storage?.[0];

  const lines = [
    `Status do sistema em ${new Date(snapshot.capturedAt).toLocaleString('pt-BR')}:`,
    `CPU: ${snapshot.cpu.loadPercent}%${snapshot.cpu.temperatureC ? ` | Temperatura: ${snapshot.cpu.temperatureC}C` : ''}`,
    `RAM: ${snapshot.memory.usedPercent}% usada (${formatBytes(snapshot.memory.usedBytes)} de ${formatBytes(snapshot.memory.totalBytes)})`,
    primaryDisk
      ? `Disco ${primaryDisk.mount || primaryDisk.filesystem || 'principal'}: ${primaryDisk.usedPercent}% usado (${formatBytes(primaryDisk.usedBytes)} de ${formatBytes(primaryDisk.sizeBytes)})`
      : 'Disco: indisponivel'
  ];

  return {
    directReturn: true,
    finalAnswer: lines.join('\n'),
    snapshot
  };
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = number;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${Math.round(size * 10) / 10} ${units[index]}`;
}
