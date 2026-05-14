import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_SPEECH_CHARS = 4000;

export async function speakText(text, options = {}) {
  const speechText = cleanSpeechText(text).slice(0, options.maxChars || MAX_SPEECH_CHARS);
  if (!speechText) return;

  const tempPath = path.join(os.tmpdir(), `nautilus-speech-${randomUUID()}.txt`);
  await fs.writeFile(tempPath, speechText, 'utf8');

  const voiceName = options.voiceName || process.env.VOICE_NAME || '';
  const rate = clampNumber(options.rate ?? process.env.VOICE_RATE ?? 0, -10, 10);
  const volume = clampNumber(options.volume ?? process.env.VOICE_VOLUME ?? 100, 0, 100);

  const script = [
    'Add-Type -AssemblyName System.Speech;',
    '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
    `$synth.Rate = ${rate};`,
    `$synth.Volume = ${volume};`,
    voiceName
      ? `$synth.SelectVoice('${escapePowerShellSingleQuoted(voiceName)}');`
      : '',
    `$text = Get-Content -LiteralPath '${escapePowerShellSingleQuoted(tempPath)}' -Raw -Encoding UTF8;`,
    '$synth.Speak($text);',
    '$synth.Dispose();'
  ]
    .filter(Boolean)
    .join(' ');

  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      timeout: 120000
    });
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

function cleanSpeechText(value) {
  return String(value || '')
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function clampNumber(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(Math.max(number, min), max);
}
