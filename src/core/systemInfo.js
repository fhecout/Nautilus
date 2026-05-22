import si from 'systeminformation';

export async function getSystemSnapshot() {
  const [load, mem, fsSize, temp, cpu, graphics] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.cpuTemperature(),
    si.cpu(),
    si.graphics()
  ]);

  return {
    updatedAt: new Date().toISOString(),
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
      loadPercent: round(load.currentLoad),
      temperatureC: normalizeTemperature(temp.main),
      maxTemperatureC: normalizeTemperature(temp.max)
    },
    memory: {
      totalBytes: mem.total,
      usedBytes: mem.used,
      freeBytes: mem.free,
      usedPercent: round((mem.used / mem.total) * 100)
    },
    storage: fsSize.map(disk => ({
      filesystem: disk.fs,
      mount: disk.mount,
      type: disk.type,
      sizeBytes: disk.size,
      usedBytes: disk.used,
      availableBytes: disk.available,
      usedPercent: round(disk.use)
    })),
    graphics: (graphics.controllers || []).map(controller => ({
      model: controller.model,
      vendor: controller.vendor,
      vramMb: controller.vram,
      temperatureC: normalizeTemperature(controller.temperatureGpu)
    }))
  };
}

export function formatSystemSnapshot(snapshot) {
  const lines = [
    'Status do PC:',
    `CPU: ${snapshot.cpu.brand || 'nao identificada'} | uso ${snapshot.cpu.loadPercent ?? 'indisponivel'}% | temperatura ${formatTemperature(snapshot.cpu.temperatureC)}`,
    `RAM: ${formatBytes(snapshot.memory.usedBytes)} usados de ${formatBytes(snapshot.memory.totalBytes)} (${snapshot.memory.usedPercent}%)`
  ];

  if (snapshot.storage.length) {
    lines.push('Armazenamento:');
    for (const disk of snapshot.storage) {
      lines.push(
        `- ${disk.mount || disk.filesystem}: ${formatBytes(disk.usedBytes)} usados de ${formatBytes(disk.sizeBytes)} (${disk.usedPercent}%)`
      );
    }
  }

  // if (snapshot.graphics.length) {
  //   lines.push('GPU:');
  //   for (const gpu of snapshot.graphics) {
  //     lines.push(
  //       `- ${gpu.model || 'nao identificada'}${gpu.vramMb ? ` | VRAM ${gpu.vramMb} MB` : ''} | temperatura ${formatTemperature(gpu.temperatureC)}`
  //     );
  //   }
  // }

  lines.push('Observacao: em alguns PCs o Windows nao libera temperatura de CPU/GPU sem driver, sensor ou permissao especifica.');
  return lines.join('\n');
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return 'indisponivel';
  const gb = value / 1024 ** 3;
  if (gb >= 1024) return `${round(gb / 1024)} TB`;
  return `${round(gb)} GB`;
}

function formatTemperature(value) {
  return Number.isFinite(value) ? `${value}C` : 'indisponivel';
}

function round(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function normalizeTemperature(value) {
  if (!Number.isFinite(value) || value <= 0) return null;
  return round(value);
}

