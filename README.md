# Nautilus

Agente de IA pessoal, local-first, construido com **Node.js**, **Ollama**, **Electron** e **React**. O Nautilus conversa, executa ferramentas no PC, registra uma caixa-preta auditavel das decisoes, opera subagentes especializados, rotinas automaticas e monitoramento proativo do projeto.

---

## Funcionalidades

- **Execucao local** via Ollama, sem depender de API cloud no fluxo principal.
- **Tool calling modular** em `src/tools/`, com capacidades separadas por responsabilidade.
- **Streaming SSE** na UI em `/api/chat`, com tokens e eventos de execucao em tempo real.
- **Resposta final humanizada**: o chat nunca deve exibir JSON, argumentos de tool ou bastidores internos; o Nautilus traduz tudo para conversa natural.
- **Black Box / Observatory** em SQLite, registrando runs, eventos, tool calls, memoria consultada, Safe Mode e tempo de execucao.
- **Agent Team** com subagentes especializados: Architect, Security, Research, Executor, Critic e Decision.
- **Decision Room** (Conselheiro tecnico) para decisoes dificeis com Architect, Security, Critic e consolidacao final.
- **Rotinas / Automacoes** salvas com gatilhos por horario, dia da semana e abertura do app.
- **Problem Radar** monitora o projeto e alerta sobre arquivos grandes, tools sem teste, dependencias ociosas, TODOs antigos e lacunas de Safe Mode.
- **Planner integrado** com projetos, tarefas, subtarefas, kanban e historico.
- **Memory Studio** com CRUD de memorias, pin, busca e historico de uso via ledger.
- **Council Mode** com dois agentes deliberando antes da decisao final.
- **Memoria persistente** em SQLite (`node:sqlite`) com embeddings locais (`nomic-embed-text`) e fallback por palavra-chave.
- **Safe Mode** para bloquear operacoes destrutivas em arquivos e SQL ate confirmacao explicita.
- **Telemetria leve do sistema** com CPU/RAM sem PowerShell recorrente; disco/temperatura ficam em cache profundo.
- **Gmail OAuth** para leitura e resumo de e-mails.
- **Web scraper** com Electron/Chromium para paginas dinamicas e fallback estatico com Cheerio.
- **Interface desktop** com Electron + React ou modo terminal via CLI.

---

## Modos do agente

| Modo | Uso |
|------|-----|
| `direct` | Nautilus responde ou chama tools diretamente. |
| `council` | Nautilus Prime e Nautilus Orion debatem em segundo plano e o Nautilus mostra apenas a decisao final. |
| `team` | Um roteador seleciona subagentes especializados, coleta votos em segundo plano e mostra apenas a conclusao final. |
| `decision_room` | Decision Room para decisoes tecnicas; Architect, Security e Critic deliberam sem expor o protocolo interno no chat. |

### Voz final

O Nautilus foi ajustado para conversar como um mordomo tecnico: direto, reservado e util. A camada final em `src/core/Agent.js` normaliza respostas antes de enviar para a UI, removendo:

- JSON interno de ferramentas, como `operation`, `query`, `tags` e `text`.
- Marcadores estruturados de subagentes, como `DECISAO`, `RISCO` e `PROXIMOS PASSOS`.
- Mensagens visiveis de bastidor, como "Analisando resultado da ferramenta".

As ferramentas e subagentes continuam funcionando por baixo, mas a conversa principal recebe somente uma resposta limpa em portugues natural.

### Decision Room (Conselheiro tecnico)

Modo focado em trade-offs tecnicos. Exemplo:

**Pergunta:** Devo usar SQLite ou Postgres nesse modulo?

**Resposta tipica:**

- **Architect:** recomenda SQLite por simplicidade local.
- **Security:** SQLite reduz superficie externa.
- **Critic:** cuidado com concorrencia e backups.
- **DECISION:** use SQLite agora, abstraindo o repositorio para migrar depois.

Os subagentes deliberam sem executar tools; a execucao continua centralizada no modo `direct`.

### Agent Team

O modo `team` transforma o Nautilus em uma equipe tecnica local:

| Subagente | Responsabilidade |
|-----------|------------------|
| Architect | Arquitetura, impacto tecnico e trade-offs. |
| Security | Riscos, privacidade, permissoes, SQL destrutivo e Safe Mode. |
| Research | Contexto externo, documentos, PDF, Gmail, web e incertezas. |
| Executor | Plano de acao, ordem de tools e caminho mais simples. |
| Critic | Falhas, lacunas, edge cases e qualidade da decisao. |
| Decision | Consolida votos e entrega a decisao final. |

---

## Rotinas e automacoes

Rotinas salvas em `src/core/automations.js`, com estado de execucao em `data/automations-state.json`.

| ID | Nome | Quando roda | O que faz |
|----|------|-------------|-----------|
| `morning-briefing` | Briefing da manha | Ao abrir o Nautilus (5h-11h, 1x/dia) | Briefing, Gmail, tarefas de hoje, status do PC, radar rapido |
| `friday-review` | Revisao de sexta | Sexta 17h (1x/semana) | Resumo semanal, tarefas concluidas, atrasadas, plano da proxima semana |
| `evening-wrap` | Fechamento do dia | Diario 18h | Briefing, tarefas de hoje, atrasadas, status do PC |
| `inbox-sweep` | Varredura de inbox | Dias uteis 9h | Checagem rapida do Gmail |
| `health-check` | Health check | Diario 8h | Telemetria do PC + radar rapido |
| `project-pulse` | Pulso do projeto | Manual | Radar completo + estatisticas de tarefas |
| `monday-kickoff` | Kickoff de segunda | Segunda 8h | Briefing, atrasadas, plano da semana, radar |
| `safe-mode-audit` | Auditoria Safe Mode | Quarta 10h | Varredura completa do radar (lacunas de Safe Mode) |

O scheduler (`src/core/scheduler.js`) roda ao iniciar o servidor e a cada minuto. A UI apenas consulta o estado das rotinas; execucoes pendentes ficam centralizadas no backend para evitar disparos duplicados.

---

## Problem Radar

Modulo em `src/core/problemRadar.js`. Varre `src/` e detecta:

- Arquivos grandes demais (padrao: > 500 KB)
- Tools sem teste dedicado
- Dependencias possivelmente sem uso em `package.json`
- TODOs/FIXMEs antigos (mtime > 90 dias)
- Lacunas de Safe Mode em tools com acoes sensiveis

Endpoint: `GET /api/radar`. A UI exibe alertas no painel **PROBLEM RADAR** e o widget de radar reflete o score de severidade.

---

## Stack

| Camada | Tecnologia |
|--------|------------|
| Runtime | Node.js 22.5+ (ESM) |
| LLM | Ollama |
| API | Express 5 + CORS |
| UI | React 19 + Vite 8 |
| Desktop | Electron 42 |
| Dados | SQLite nativo (`node:sqlite`) |
| Sistema | `node:os` por padrao; `systeminformation` apenas em telemetria profunda |
| Imagens/PDF | Sharp, PDFKit, pdf-parse |

---

## Estrutura

```text
Nautilus/
├── electron/           # Shell desktop
├── config/             # Credenciais OAuth locais
├── data/               # SQLite: memoria, ledger, planner, automations-state
├── logs/               # Logs do scraper
├── scripts/            # Utilitarios
├── src/
│   ├── core/           # Agent, ledger, subagentes, automacoes, radar, planner
│   ├── tools/          # Ferramentas do agente
│   ├── ui/             # Frontend React
│   ├── index.js        # CLI
│   └── server.js       # API HTTP + SSE
├── tests/
├── index.html
├── start-nautilus.bat
└── package.json
```

---

## Ferramentas

| Tool | Descricao |
|------|-----------|
| `manage_files` | Criar, ler, editar, listar, mover e apagar arquivos locais. |
| `find_local_files` | Busca por nome/conteudo com limite de profundidade. |
| `convert_file` | Conversao de imagens, texto para PDF e PDF para texto. |
| `manage_archive` | Compactar e extrair ZIP. |
| `manage_sqlite` | Consultas e edicoes em SQLite com Safe Mode. |
| `manage_memory` | Salvar, listar, buscar e apagar memorias. |
| `manage_planner` | Projetos, tarefas, subtarefas e anotacoes. |
| `read_pdf` | Ler e responder perguntas sobre PDFs. |
| `read_gmail` | Ler e resumir e-mails via Google OAuth. |
| `search_google` | Buscar links na web/noticias. |
| `scrape_web_site` | Extrair conteudo estruturado de paginas publicas. |
| `get_system_status` | Telemetria do PC: CPU, RAM, discos e temperatura. |
| `get_system_time` | Data e hora do sistema. |

---

## API

| Metodo | Rota | Uso |
|--------|------|-----|
| `GET` | `/api/status` | Status do modelo, Ollama e quantidade de tools. |
| `GET` | `/api/system` | Snapshot de telemetria do computador. |
| `GET` | `/api/radar` | Varredura proativa do projeto (Problem Radar). |
| `GET` | `/api/automations` | Lista rotinas salvas e ultimos relatorios. |
| `GET` | `/api/automations/:id` | Detalhe de uma rotina. |
| `POST` | `/api/automations/run-due` | Executa rotinas pendentes pelo gatilho. |
| `POST` | `/api/automations/:id/run` | Executa rotina manualmente. |
| `GET` | `/api/memories` | Lista memorias. |
| `POST` | `/api/memories` | Cria memoria. |
| `PUT` | `/api/memories/:id` | Atualiza ou fixa memoria. |
| `DELETE` | `/api/memories/:id` | Apaga memoria. |
| `GET` | `/api/memories/:id/history` | Historico de uso da memoria no ledger. |
| `GET` | `/api/projects` | Lista projetos do planner. |
| `POST` | `/api/projects` | Cria projeto. |
| `GET/PUT/DELETE` | `/api/projects/:id` | CRUD de projeto. |
| `GET` | `/api/projects/:id/history` | Historico do projeto. |
| `POST` | `/api/projects/:id/notes` | Adiciona anotacao ao projeto. |
| `GET` | `/api/tasks` | Lista tarefas (filtros: projeto, status, prioridade, busca). |
| `POST` | `/api/tasks` | Cria tarefa. |
| `GET/PUT/DELETE` | `/api/tasks/:id` | CRUD de tarefa. |
| `GET` | `/api/tasks/:id/history` | Historico da tarefa. |
| `POST` | `/api/tasks/:id/subtasks` | Cria subtarefa. |
| `GET` | `/api/observatory` | Estatisticas da Black Box, runs recentes, subagentes e radar. |
| `GET` | `/api/runs` | Lista de execucoes auditadas. |
| `GET` | `/api/runs/:id` | Replay de uma execucao com eventos, tools, memoria e Safe Mode. |
| `POST` | `/api/chat` | Chat com streaming SSE. |

Exemplo de chamada:

```json
{
  "message": "Devo usar SQLite ou Postgres nesse modulo?",
  "mode": "decision_room"
}
```

Valores aceitos em `mode`: `direct`, `council`, `team`, `decision_room`.

O backend processa um comando de chat por vez. Se outra execucao ja estiver em andamento, `/api/chat` retorna `429` para evitar multiplas chamadas simultaneas ao Ollama consumindo toda a CPU.

---

## Requisitos

- Node.js >= 22.5, necessario para `node:sqlite`.
- Ollama instalado e em execucao.
- Modelos recomendados:

```bash
ollama pull nomic-embed-text
ollama pull qwen3.5:9b
```

---

## Instalacao

```bash
git clone <seu-repositorio>
cd Nautilus
npm install
```

Crie um `.env` na raiz:

```env
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:9b
NAUTILUS_PORT=3333
```

Opcional:

```env
NAUTILUS_PEER_MODEL=qwen3.5:9b
NAUTILUS_MAX_SUBAGENTS=3
NAUTILUS_SUBAGENT_NUM_PREDICT=220
NAUTILUS_DECISION_NUM_PREDICT=280
NAUTILUS_COUNCIL_NUM_PREDICT=320
NAUTILUS_SYSTEM_CACHE_TTL_MS=15000
NAUTILUS_DEEP_SYSTEM_METRICS=false
NAUTILUS_DEEP_SYSTEM_CACHE_TTL_MS=120000
MEMORY_DB_PATH=data/memory.sqlite
LEDGER_DB_PATH=data/agent-ledger.sqlite
PLANNER_DB_PATH=data/planner.sqlite
SAFE_MODE=true
RADAR_LARGE_FILE_KB=500
RADAR_TODO_AGE_DAYS=90
VITE_NAUTILUS_API_URL=http://127.0.0.1:3333
```

Para Gmail, rode:

```bash
npm run gmail:auth
```

---

## Como executar

### Windows

- **Iniciar:** duplo clique em `start-nautilus.bat` (sobe Vite, API e abre o **Electron**).
- **Encerrar tudo:** duplo clique em `stop-nautilus.bat` (fecha API, frontend e processos na porta 3333/5173).

### Desktop em desenvolvimento

```bash
npm run ui
```

Em outro terminal:

```powershell
$env:VITE_DEV_SERVER_URL="http://127.0.0.1:5173"
npx electron .
```

### Navegador

```bash
npm run server
npm run ui
```

Abra `http://127.0.0.1:5173`.

### CLI

```bash
npm start
```

---

## Scripts

| Script | Descricao |
|--------|-----------|
| `npm start` | Agente no terminal. |
| `npm run server` | API Express. |
| `npm run ui` | Vite dev server. |
| `npm run build` | Build estatico da UI. |
| `npm run desktop` | Build + Electron. |
| `npm run gmail:auth` | Fluxo OAuth do Gmail. |
| `npm test` | Testes com `node --test`. |

---

## Testes

```bash
npm test
```

Os testes cobrem memoria SQLite, Safe Mode, Agent Ledger, subagentes, Decision Room, automacoes, Problem Radar e planner.

---

## Seguranca

- Credenciais, `.env`, tokens, bancos locais e logs nao devem ser commitados.
- O agente pode ler/escrever arquivos e executar SQL: mantenha Safe Mode ativo.
- Conteudo vindo de arquivos, sites, e-mails e PDFs nao altera as regras internas do agente.
- URLs locais/privadas sao bloqueadas no scraper/PDF remoto para reduzir risco de SSRF.
- Subagentes e Decision Room nao executam tools diretamente; eles recomendam e o Nautilus central decide.
- O Problem Radar e assistente proativo: revise os alertas antes de agir automaticamente.

---

## Performance

- `/api/system` usa telemetria leve e cache de 15s por padrao.
- Temperatura e discos usam `systeminformation` apenas quando `NAUTILUS_DEEP_SYSTEM_METRICS=true` ou quando a tool `get_system_status` e chamada explicitamente.
- A UI consulta sistema e Observatory a cada 15s, nao a cada poucos segundos.
- Team Mode usa 3 subagentes por padrao e limites de geracao (`num_predict`) para reduzir CPU.
- Council/Decision Room tambem usam limites curtos de geracao.
- O Electron verifica se a API esta online via `/api/status`, evitando acionar telemetria pesada no boot.

---

## Alteracoes recentes (automacoes, Decision Room, Radar)

Esta versao adiciona:

1. **Automacoes / rotinas** — 8 rotinas builtin com scheduler, API REST e painel na UI.
2. **Decision Room** — novo modo `decision_room` no chat, eventos SSE dedicados e aba DECISION na UI.
3. **Problem Radar** — engine de varredura, endpoint `/api/radar`, integracao no Observatory e painel lateral.
4. **API completa** — rotas de memoria, planner e automacoes no `server.js`.
5. **Testes** — `automations.test.js`, `problem_radar.test.js` e cobertura de `routeDecisionRoom()`.

---

## Status

Projeto em desenvolvimento ativo.

Licenca: ISC
