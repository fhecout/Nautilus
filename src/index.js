import readline from 'readline';
import { Agent } from './core/Agent.js';
import { loadEnvFile } from './core/env.js';
import {
  clearScraperLogs,
  formatScraperLogDetail,
  formatScraperLogList,
  getScraperLog,
  readScraperLogs
} from './core/ScraperLogs.js';

loadEnvFile();

const MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

const agent = new Agent(MODEL, { ollamaHost: OLLAMA_HOST });

console.log('\nAgente Inicializado: Nautilus');
console.log(`Modelo Ollama: ${MODEL}`);
console.log(`Servidor Ollama: ${agent.ollamaHost}`);
console.log("(Digite 'sair' ou 'exit' para encerrar)");
console.log('Comandos: logs | log <id> | logs limpar\n');

try {
  const status = await agent.checkOllamaConnection();
  if (!status.hasModel) {
    console.log(`Aviso: modelo "${MODEL}" nao encontrado no Ollama.`);
    console.log(`Instale com: ollama pull ${MODEL}\n`);
  }
} catch (error) {
  console.log(agent.formatOllamaError(error));
  console.log();
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let isClosing = false;
rl.on('close', () => {
  isClosing = true;
});

const askQuestion = () => {
  if (isClosing) return;

  rl.question('\nVoce: ', async userInput => {
    const normalizedInput = userInput.trim().toLowerCase();

    if (!normalizedInput) {
      askQuestion();
      return;
    }

    if (normalizedInput === 'sair' || normalizedInput === 'exit') {
      console.log('Encerrando...');
      rl.close();
      process.exit(0);
      return;
    }

    if (await handleLogCommand(userInput)) {
      askQuestion();
      return;
    }

    process.stdout.write('\nAgente: ');

    await agent.chat(userInput, text => {
      process.stdout.write(text);
    });

    console.log();
    askQuestion();
  });
};

askQuestion();

async function handleLogCommand(userInput) {
  const normalized = userInput.trim().toLowerCase();

  if (normalized === 'logs') {
    const logs = await readScraperLogs();
    console.log('\n=== Logs do Scraper ===\n');
    console.log(formatScraperLogList(logs));
    return true;
  }

  if (normalized === 'logs limpar' || normalized === 'limpar logs') {
    await clearScraperLogs();
    console.log('\nLogs do scraper apagados.');
    return true;
  }

  const detailMatch = normalized.match(/^log\s+#?(\d+)$/);
  if (detailMatch) {
    const log = await getScraperLog(Number.parseInt(detailMatch[1], 10));
    console.log('\n=== Detalhe do Log ===\n');
    console.log(formatScraperLogDetail(log));
    return true;
  }

  return false;
}
