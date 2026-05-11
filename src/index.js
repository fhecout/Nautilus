import readline from 'readline';
import { Agent } from './core/Agent.js';
import {
  clearScraperLogs,
  formatScraperLogDetail,
  formatScraperLogList,
  getScraperLog,
  readScraperLogs
} from './core/ScraperLogs.js';

const MODEL = 'llama3.2:3b';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const agent = new Agent(MODEL);

console.log('\nAgente Inicializado: Nautilus');
console.log(`Modelo Ollama: ${MODEL}`);
console.log("(Digite 'sair' ou 'exit' para encerrar)");
console.log('Comandos: logs | log <id> | logs limpar\n');

const askQuestion = () => {
  rl.question('\nVoce: ', async userInput => {
    const normalizedInput = userInput.trim().toLowerCase();

    if (normalizedInput === 'sair' || normalizedInput === 'exit') {
      console.log('Encerrando...');
      rl.close();
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
