import os from 'node:os';

const DEFAULT_CACHE_TTL_MS = 15_000;
const DEFAULT_DEEP_CACHE_TTL_MS = 120_000;

let cachedSnapshot = null;
let cachedAt = 0;
let pendingSnapshot = null;
let lastCpuSample = readCpuSample();
let lastDeepMetrics = {
  capturedAt: 0,
  temperatureC: null,
  storage: []
};

export async function getSystemSnapshot(options = {}) {
  const now = Date.now();
  const cacheTtlMs = clampInteger(
    options.cacheTtlMs ?? process.env.NAUTILUS_SYSTEM_CACHE_TTL_MS ?? DEFAULT_CACHE_TTL_MS,
    1000,
    300000
  );

  if (!options.force && cachedSnapshot && now - cachedAt < cacheTtlMs) {
    return cachedSnapshot;
  }

  if (pendingSnapshot) return pendingSnapshot;

  pendingSnapshot = buildSystemSnapshot(options)
    .then(snapshot => {
      cachedSnapshot = snapshot;
      cachedAt = Date.now();
      return snapshot;
    })
    .finally(() => {
      pendingSnapshot = null;
    });

  return pendingSnapshot;
}

async function buildSystemSnapshot(options = {}) {
  const includeDeep = options.includeDeep === true || process.env.NAUTILUS_DEEP_SYSTEM_METRICS === 'true';
  const deepMetrics = includeDeep ? await getDeepMetrics(options) : lastDeepMetrics;
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    capturedAt: new Date().toISOString(),
    mode: includeDeep ? 'deep' : 'light',
    os: {
      platform: os.platform(),
      distro: os.type(),
      release: os.release(),
      arch: os.arch()
    },
    cpu: {
      loadPercent: sampleCpuLoad(),
      temperatureC: deepMetrics.temperatureC
    },
    memory: {
      totalBytes: totalMemory,
      usedBytes: usedMemory,
      freeBytes: freeMemory,
      usedPercent: totalMemory ? roundPercent((usedMemory / totalMemory) * 100) : 0
    },
    storage: deepMetrics.storage || []
  };
}

async function getDeepMetrics(options = {}) {
  const now = Date.now();
  const deepCacheTtlMs = clampInteger(
    options.deepCacheTtlMs ?? process.env.NAUTILUS_DEEP_SYSTEM_CACHE_TTL_MS ?? DEFAULT_DEEP_CACHE_TTL_MS,
    15000,
    900000
  );

  if (now - lastDeepMetrics.capturedAt < deepCacheTtlMs) {
    return lastDeepMetrics;
  }

  try {
    const si = (await import('systeminformation')).default;
    const [temperature, disks] = await Promise.all([
      si.cpuTemperature().catch(() => null),
      si.fsSize().catch(() => [])
    ]);

    lastDeepMetrics = {
      capturedAt: now,
      temperatureC: normalizeTemperature(temperature),
      storage: Array.isArray(disks)
        ? disks.slice(0, 8).map(disk => ({
            filesystem: disk.fs || null,
            mount: disk.mount || null,
            type: disk.type || null,
            sizeBytes: Number(disk.size || 0),
            usedBytes: Number(disk.used || 0),
            availableBytes: Number(disk.available || 0),
            usedPercent: roundPercent(disk.use)
          }))
        : []
    };
  } catch {
    lastDeepMetrics = {
      capturedAt: now,
      temperatureC: null,
      storage: []
    };
  }

  return lastDeepMetrics;
}

function sampleCpuLoad() {
  const current = readCpuSample();
  const idleDelta = current.idle - lastCpuSample.idle;
  const totalDelta = current.total - lastCpuSample.total;
  lastCpuSample = current;

  if (totalDelta <= 0) return 0;
  return roundPercent((1 - idleDelta / totalDelta) * 100);
}

function readCpuSample() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
  }

  return { idle, total };
}

function normalizeTemperature(value) {
  const candidates = [value?.main, value?.max, ...(Array.isArray(value?.cores) ? value.cores : [])]
    .map(Number)
    .filter(Number.isFinite)
    .filter(item => item > 0);

  if (candidates.length === 0) return null;
  return Math.round(Math.max(...candidates) * 10) / 10;
}

function roundPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.min(100, Math.max(0, number)) * 10) / 10;
}

function clampInteger(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}
