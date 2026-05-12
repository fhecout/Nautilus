import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
export const GMAIL_CONFIG_DIR = path.resolve(process.cwd(), 'config');
export const GMAIL_SECRETS_DIR = path.resolve(process.cwd(), '.secrets');
export const GMAIL_CREDENTIALS_PATH = path.join(GMAIL_CONFIG_DIR, 'gmail-oauth-credentials.json');
export const GMAIL_TOKEN_PATH = path.join(GMAIL_SECRETS_DIR, 'gmail-token.json');
export const GMAIL_REDIRECT_URI = 'http://localhost:3001/oauth2callback';

export async function createGmailOAuthClient() {
  const credentials = await readJsonFile(GMAIL_CREDENTIALS_PATH);
  const clientConfig = credentials.installed || credentials.web;

  if (!clientConfig?.client_id || !clientConfig?.client_secret) {
    throw new Error(
      `Credenciais invalidas em ${GMAIL_CREDENTIALS_PATH}. Baixe um OAuth Client JSON do Google Cloud.`
    );
  }

  return new google.auth.OAuth2(
    clientConfig.client_id,
    clientConfig.client_secret,
    GMAIL_REDIRECT_URI
  );
}

export async function getAuthenticatedGmailClient() {
  const auth = await createGmailOAuthClient();
  const token = await readJsonFile(GMAIL_TOKEN_PATH);
  auth.setCredentials(token);
  return google.gmail({ version: 'v1', auth });
}

export async function getGmailAuthUrl() {
  const auth = await createGmailOAuthClient();

  return auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES
  });
}

export async function saveGmailTokenFromCode(code) {
  const auth = await createGmailOAuthClient();
  const { tokens } = await auth.getToken(code);

  await fs.mkdir(GMAIL_SECRETS_DIR, { recursive: true });
  await fs.writeFile(GMAIL_TOKEN_PATH, `${JSON.stringify(tokens, null, 2)}\n`, 'utf8');

  return tokens;
}

export function getGmailSetupInstructions(errorMessage) {
  return [
    errorMessage ? `Gmail ainda nao esta conectado: ${errorMessage}` : 'Gmail ainda nao esta conectado.',
    '',
    'Como conectar:',
    '1. Acesse Google Cloud Console e crie/abra um projeto.',
    '2. Ative a Gmail API.',
    '3. Configure a tela de consentimento OAuth.',
    '4. Crie um OAuth Client do tipo Desktop app ou Web app.',
    `5. Se for Web app, adicione este redirect URI: ${GMAIL_REDIRECT_URI}`,
    `6. Baixe o JSON e salve como: ${GMAIL_CREDENTIALS_PATH}`,
    '7. Rode: npm run gmail:auth',
    '8. Depois disso, peça: leia meus emails do Gmail.'
  ].join('\n');
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`arquivo nao encontrado: ${filePath}`);
    }

    throw error;
  }
}
