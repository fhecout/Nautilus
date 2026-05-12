import http from 'node:http';
import {
  GMAIL_REDIRECT_URI,
  getGmailAuthUrl,
  getGmailSetupInstructions,
  saveGmailTokenFromCode
} from '../src/core/GmailAuth.js';

const PORT = new URL(GMAIL_REDIRECT_URI).port || 3001;

async function main() {
  let authUrl;

  try {
    authUrl = await getGmailAuthUrl();
  } catch (error) {
    console.error(getGmailSetupInstructions(error.message));
    process.exitCode = 1;
    return;
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, GMAIL_REDIRECT_URI);

    if (url.pathname !== '/oauth2callback') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      response.writeHead(400);
      response.end('Codigo OAuth nao encontrado.');
      return;
    }

    try {
      await saveGmailTokenFromCode(code);
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Gmail conectado com sucesso. Voce ja pode voltar ao Nautilus.');
      console.log('\nGmail conectado com sucesso.');
      server.close();
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`Erro ao salvar token: ${error.message}`);
      console.error(`Erro ao salvar token: ${error.message}`);
      server.close();
      process.exitCode = 1;
    }
  });

  server.listen(PORT, () => {
    console.log('Abra este link no navegador e autorize o Gmail:\n');
    console.log(authUrl);
    console.log('\nAguardando retorno do Google...');
  });
}

main();
