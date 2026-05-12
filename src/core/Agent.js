import { Ollama } from 'ollama';
import { getToolDefinitions, executeTool } from '../tools/index.js';

export class Agent {
  constructor(modelName, options = {}) {
    this.modelName = modelName;
    this.ollamaHost = (options.ollamaHost || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    this.ollama = new Ollama({ host: this.ollamaHost });
    this.messages = [];
    this.lastSearch = null;
    this.lastScrape = null;

    // Prompt de sistema principal
    const systemPrompt = [
      'Voce e Nautilus, um assistente profissional no estilo Jarvis: objetivo, contextual e util no dia a dia.',
      'Responda sempre em portugues do Brasil.',
      'Entenda a intencao atual do usuario. O assunto pode mudar a qualquer mensagem; nao force contexto antigo.',
      'Se o usuario pedir codigo, ajude como engenheiro: direto, pratico e sem enrolacao.',
      'Se o usuario pedir pesquisa na internet, use search_google. Essa ferramenta retorna fontes: nome do resultado e link.',
      'Se o usuario pedir para ver, acessar, abrir, ler, resumir ou aprofundar um site/resultado/noticia, use scrape_web_site e entregue uma sintese clara do conteudo.',
      'Se o usuario pedir para ler, procurar, resumir, traduzir ou perguntar algo sobre um PDF, use read_pdf.',
      'Se o usuario pedir para ler, verificar, resumir ou procurar emails/Gmail/caixa de entrada, use read_gmail.',
      'Se o usuario pedir para criar, ler, listar ou editar arquivos locais, use manage_files.',
      'Se o usuario pedir para encontrar arquivos no PC, navegar em pastas ou localizar documentos/imagens/bancos, use find_local_files.',
      'Se o usuario pedir para converter formatos de arquivo como JPG/JPEG/PNG/PDF/TXT, use convert_file.',
      'Se o usuario pedir para compactar, zipar ou extrair ZIP, use manage_archive.',
      'Se o usuario pedir para criar, consultar ou editar banco SQLite, use manage_sqlite.',
      'Use ferramentas somente quando o pedido do usuario realmente exigir dados externos, hora atual, site, PDF, Gmail, arquivos locais, conversao, compactacao ou SQLite.',
      'Para noticias, explique o contexto: o que aconteceu, quem esta envolvido e por que importa. Nao apenas repita manchetes.',
      'Para perguntas objetivas, responda o dado pedido primeiro. Exemplo: preco, data, valor, status, passo principal.',
      'Se uma ferramenta devolver resposta direta, imprima exatamente essa resposta. Se devolver conteudo para analise, resuma em portugues sem copiar texto cru.',
      'Seja curto e organizado. Evite textao, floreio e lista gigante.'
    ].join(' ');
    this.messages.push({ role: 'system', content: systemPrompt });
  }

  async chat(userInput, onToken) {
    this.messages.push({ role: 'user', content: userInput });

    const gmailAccess = this.resolveGmailAccess(userInput);
    if (gmailAccess) {
      await this.openGmail(gmailAccess, userInput, onToken);
      return;
    }

    const pdfAccess = this.resolvePdfAccess(userInput);
    if (pdfAccess) {
      await this.openPdf(pdfAccess, userInput, onToken);
      return;
    }

    const directUrlAccess = this.resolveDirectUrlAccess(userInput);
    if (directUrlAccess) {
      await this.openSpecificUrl(directUrlAccess, userInput, onToken);
      return;
    }

    const directAccess = this.resolveAuthorizedSearchResult(userInput);
    if (directAccess) {
      await this.openSearchResult(directAccess, userInput, onToken);
      return;
    }

    const articleFollowup = this.resolveArticleFollowup(userInput);
    if (articleFollowup) {
      await this.openArticleFollowup(articleFollowup, userInput, onToken);
      return;
    }

    try {
      while (true) {
        const tools = this.getToolsForInput(userInput);
        const request = {
          model: this.modelName,
          messages: this.messages,
          stream: true,
        };
        if (tools.length > 0) {
          request.tools = tools;
        }

        const responseStream = await this.ollama.chat(request);

        let fullContent = '';
        let toolCalls = [];

        for await (const chunk of responseStream) {
          // Se o modelo estiver gerando texto (ou "pensando")
          if (chunk.message.content) {
            fullContent += chunk.message.content;
            if (onToken) onToken(chunk.message.content);
          }

          // O Ollama envia as chamadas de tools dentro dos chunks
          if (chunk.message.tool_calls && chunk.message.tool_calls.length > 0) {
            toolCalls = chunk.message.tool_calls;
          }
        }

        // Reconstrói a mensagem do assistente para adicionar ao histórico
        const assistantMessage = { role: 'assistant', content: fullContent };
        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls;
        }
        this.messages.push(assistantMessage);

        if (toolCalls.length > 0) {
          // O modelo decidiu usar uma ou mais ferramentas
          for (const toolCall of toolCalls) {
            console.log(`\n\n[🔧 Executando Ação: ${toolCall.function.name}...]`);

            try {
              const args = toolCall.function.arguments;
              const result = await executeTool(toolCall.function.name, args);
              this.rememberToolResult(toolCall.function.name, result);
              const toolContent =
                result && typeof result.modelInput === 'string' && result.modelInput.trim()
                  ? result.modelInput
                  : result && typeof result.finalAnswer === 'string' && result.finalAnswer.trim()
                    ? result.finalAnswer
                    : JSON.stringify(result);

              // Adiciona o resultado da tool no histórico
              this.messages.push({
                role: 'tool',
                content: toolContent,
              });

              if (
                result &&
                result.directReturn === false &&
                typeof result.modelInput === 'string' &&
                result.modelInput.trim()
              ) {
                if (onToken) onToken('\n[Analisando resultado da ferramenta...]\nAgente: ');
                await this.respondFromIsolatedToolContent(result.modelInput, onToken);
                return;
              }

              if (
                result &&
                result.directReturn !== false &&
                typeof result.finalAnswer === 'string' &&
                result.finalAnswer.trim()
              ) {
                if (onToken) onToken(result.finalAnswer);
                this.messages.push({
                  role: 'assistant',
                  content: result.finalAnswer,
                });
                return;
              }
            } catch (err) {
              console.error(`Erro ao executar tool ${toolCall.function.name}:`, err);
              this.messages.push({
                role: 'tool',
                content: JSON.stringify({ error: err.message }),
              });
            }
          }
          // Após executar a tool, damos um aviso visual e continuamos o loop
          if (onToken) onToken('\n[Analisando resultado da ferramenta...]\nAgente: ');
        } else {
          // Sem ferramentas chamadas, resposta final concluída.
          break;
        }
      }
    } catch (error) {
      const message = this.formatOllamaError(error);
      if (!this.isOllamaConnectionError(error)) {
        console.error(`\n[Erro do Ollama no Agent]: ${error.message}`);
      }
      if (onToken) onToken(message);
    }
  }

  getToolsForInput(userInput) {
    const normalized = this.normalizeText(userInput);
    const toolNames = [];

    if (/\b(hora|horas|horario|que dia|qual dia|data atual|dia de hoje)\b/.test(normalized)) {
      toolNames.push('get_system_time');
    }

    if (
      /\b(pesquise|pesquisar|busque|buscar|procure|procurar|google|internet|web|noticia|noticias|ultimas|atualizado|preco atual|cotacao)\b/.test(
        normalized
      )
    ) {
      toolNames.push('search_google');
    }

    if (
      /\b(arquivo|arquivos|pasta|pastas|txt|md|json|csv|crie|criar|edite|editar|altere|alterar|escreva|salve|listar|liste|leia|ler)\b/.test(
        normalized
      )
    ) {
      toolNames.push('manage_files');
    }

    if (
      /\b(encontre|encontrar|localize|localizar|buscar arquivo|procurar arquivo|procure arquivo|meu pc|computador|downloads|documentos|desktop|imagens|navegar)\b/.test(
        normalized
      )
    ) {
      toolNames.push('find_local_files');
    }

    if (
      /\b(converta|converter|transforme|transformar|formato|jpg|jpeg|png|webp|gif|bmp|tiff|pdf para|para pdf|para png|para jpg|para jpeg|para txt)\b/.test(
        normalized
      )
    ) {
      toolNames.push('convert_file');
    }

    if (/\b(compacte|compactar|zip|zipar|descompacte|descompactar|extrair|extraia)\b/.test(normalized)) {
      toolNames.push('manage_archive');
    }

    if (/\b(sqlite|sql|banco de dados|database|tabela|consulta|select|insert|update|delete)\b/.test(normalized)) {
      toolNames.push('manage_sqlite');
    }

    if (toolNames.length === 0) return [];
    return getToolDefinitions([...new Set(toolNames)]);
  }

  async checkOllamaConnection() {
    const response = await fetch(`${this.ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) {
      throw new Error(`Ollama respondeu HTTP ${response.status}`);
    }

    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const hasModel = models.some(model => model.name === this.modelName || model.model === this.modelName);

    return {
      models,
      hasModel
    };
  }

  formatOllamaError(error) {
    if (this.isOllamaConnectionError(error)) {
      return [
        `Nao consegui conectar no Ollama em ${this.ollamaHost}.`,
        'Verifique se o Ollama esta aberto ou rode: ollama serve',
        `Depois confirme o modelo com: ollama list`
      ].join('\n');
    }

    if (error?.name === 'TimeoutError') {
      return [
        `O Ollama em ${this.ollamaHost} demorou demais para responder.`,
        'Feche e abra o Ollama novamente ou rode: ollama serve',
        `Depois tente de novo com: npm start`
      ].join('\n');
    }

    return `Erro ao conversar com o Ollama: ${error?.message || error}`;
  }

  isOllamaConnectionError(error) {
    return error?.message === 'fetch failed' || error?.cause?.code === 'ECONNREFUSED';
  }

  resolveDirectUrlAccess(userInput) {
    const normalized = userInput
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const hasAccessIntent = /\b(veja|acesse|abra|olhe|analise|leia|ver|abrir|acessar)\b/.test(
      normalized
    );
    if (!hasAccessIntent) return null;

    const urlMatch = userInput.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) return urlMatch[0];

    const domainMatch = userInput.match(/\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i);
    if (!domainMatch) return null;

    const domain = domainMatch[0];
    if (/^\d+(?:\.\d+)+$/.test(domain)) return null;
    if (/\.(txt|md|json|csv|sql|db|sqlite|pdf|jpg|jpeg|png|webp|gif|bmp|zip|rar|7z)$/i.test(domain)) {
      return null;
    }
    return domain;
  }

  resolvePdfAccess(userInput) {
    const normalized = this.normalizeText(userInput);
    if (!/\b(pdf|arquivo|documento)\b/.test(normalized)) return null;

    const hasIntent = /\b(leia|ler|veja|abrir|abra|resuma|resumir|procure|busque|analise|traduza|traduzir|pergunta|pergunte)\b/.test(
      normalized
    );
    if (!hasIntent) return null;

    const quoted = userInput.match(/["']([^"']+\.pdf|[^"']+)["']/i);
    if (quoted) return quoted[1];

    const pathOrFile = userInput.match(/([a-zA-Z]:\\[^\n\r]+?\.pdf|https?:\/\/[^\s]+\.pdf|[^\s"'<>]+\.pdf)/i);
    if (pathOrFile) return pathOrFile[1].trim();

    return userInput
      .replace(/\b(leia|ler|veja|abrir|abra|resuma|resumir|procure|busque|analise|traduza|traduzir|pdf|arquivo|documento)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  resolveGmailAccess(userInput) {
    const normalized = this.normalizeText(userInput);
    if (!/\b(gmail|email|emails|e-mail|e-mails|caixa de entrada|inbox)\b/.test(normalized)) {
      return null;
    }

    const hasIntent = /\b(leia|ler|ver|veja|verificar|verifique|resuma|resumir|procure|buscar|busque|olhe|listar|liste|quais|quem|empresa|empresas|recebi|recebidos|chegou|chegaram|tem|tenho)\b/.test(
      normalized
    );
    if (!hasIntent) return null;

    const unreadOnly = /\b(nao lidos|não lidos|unread|novos)\b/.test(normalized);
    const queryParts = [];
    if (unreadOnly) queryParts.push('is:unread');

    const fromMatch = userInput.match(/(?:de|from:)\s+([^\s]+@[^\s]+)/i);
    if (fromMatch) queryParts.push(`from:${fromMatch[1]}`);

    const subjectMatch = userInput.match(/(?:assunto|subject:)\s+["']([^"']+)["']/i);
    if (subjectMatch) queryParts.push(`subject:${subjectMatch[1]}`);

    return {
      query: queryParts.join(' '),
      maxResults: 10,
      includeBody: true,
      question: userInput
    };
  }

  resolveAuthorizedSearchResult(userInput) {
    if (!this.lastSearch?.results?.length) return null;

    const normalized = userInput
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const hasAccessIntent = /\b(veja|acesse|abra|olhe|analise|leia|ver|abrir|acessar)\b/.test(
      normalized
    );
    if (!hasAccessIntent) return null;

    const match = normalized.match(/\b(?:site|resultado|link)?\s*(\d{1,2})\b/);
    if (!match) return null;

    const index = Number.parseInt(match[1], 10) - 1;
    const result = this.lastSearch.results[index];
    if (!result?.url) return null;

    return {
      index,
      result,
      question: `${this.lastSearch.query}. ${userInput}`
    };
  }

  async openSearchResult(access, userInput, onToken) {
    console.log(`\n\n[🔧 Executando Ação: scrape_web_site...]`);

    try {
      const result = await executeTool('scrape_web_site', {
        url: access.result.url,
        question: access.question
      });
      this.rememberToolResult('scrape_web_site', result);

      const prompt = result.modelInput || result.finalAnswer || JSON.stringify(result);

      if (onToken) onToken('\n[Analisando resultado da ferramenta...]\nAgente: ');
      await this.respondFromIsolatedToolContent(prompt, onToken);
    } catch (err) {
      const message = `Nao consegui acessar o site ${access.index + 1}: ${err.message}`;
      if (onToken) onToken(message);
      this.messages.push({
        role: 'assistant',
        content: message,
      });
    }
  }

  async openSpecificUrl(url, userInput, onToken) {
    console.log(`\n\n[🔧 Executando Ação: scrape_web_site...]`);

    try {
      const result = await executeTool('scrape_web_site', {
        url,
        question: userInput
      });
      this.rememberToolResult('scrape_web_site', result);

      const prompt = result.modelInput || result.finalAnswer || JSON.stringify(result);
      if (onToken) onToken('\n[Analisando resultado da ferramenta...]\nAgente: ');
      await this.respondFromIsolatedToolContent(prompt, onToken);
    } catch (err) {
      const message = `Nao consegui acessar o site: ${err.message}`;
      if (onToken) onToken(message);
      this.messages.push({
        role: 'assistant',
        content: message,
      });
    }
  }

  async openPdf(source, userInput, onToken) {
    console.log(`\n\n[🔧 Executando Ação: read_pdf...]`);

    try {
      const result = await executeTool('read_pdf', {
        source,
        question: userInput
      });

      const prompt = result.modelInput || result.finalAnswer || JSON.stringify(result);
      if (onToken) onToken('\n[Analisando PDF...]\nAgente: ');
      await this.respondFromIsolatedToolContent(prompt, onToken);
    } catch (err) {
      const message = `Nao consegui ler o PDF: ${err.message}`;
      if (onToken) onToken(message);
      this.messages.push({
        role: 'assistant',
        content: message,
      });
    }
  }

  async openGmail(input, userInput, onToken) {
    console.log(`\n\n[🔧 Executando Ação: read_gmail...]`);

    try {
      const result = await executeTool('read_gmail', input);
      const prompt = result.modelInput || result.finalAnswer || JSON.stringify(result);

      if (
        result.directReturn !== false &&
        typeof result.finalAnswer === 'string' &&
        result.finalAnswer.trim()
      ) {
        if (onToken) onToken(result.finalAnswer);
        this.messages.push({
          role: 'assistant',
          content: result.finalAnswer,
        });
        return;
      }

      if (onToken) onToken('\n[Analisando Gmail...]\nAgente: ');
      await this.respondFromIsolatedToolContent(prompt, onToken);
    } catch (err) {
      const message = `Nao consegui ler o Gmail: ${err.message}`;
      if (onToken) onToken(message);
      this.messages.push({
        role: 'assistant',
        content: message,
      });
    }
  }

  resolveArticleFollowup(userInput) {
    if (!this.lastScrape?.newsItems?.length) return null;

    const normalized = this.normalizeText(userInput);
    const wantsDetails = /\b(sim|pode|leia|ler|detalhe|detalhes|aprofundar|noticia|materia|abre|abra|acesse|veja)\b/.test(
      normalized
    );
    if (!wantsDetails) return null;

    const numbered = normalized.match(/\b(?:noticia|materia|item|opcao|opcao|resultado)?\s*(\d{1,2})\b/);
    if (numbered) {
      const index = Number.parseInt(numbered[1], 10) - 1;
      const item = this.lastScrape.newsItems[index];
      if (item?.url) return { item, index };
    }

    const queryTerms = normalized
      .split(/[^a-z0-9]+/i)
      .filter(term => term.length >= 4)
      .filter(term => !['leia', 'mais', 'sobre', 'noticia', 'materia', 'detalhes', 'pode'].includes(term));

    if (queryTerms.length > 0) {
      const ranked = this.lastScrape.newsItems
        .map((item, index) => ({
          item,
          index,
          score: queryTerms.reduce((score, term) => {
            return this.normalizeText(`${item.title} ${item.summary || ''}`).includes(term)
              ? score + 1
              : score;
          }, 0)
        }))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score);

      if (ranked[0]?.item?.url) {
        return {
          item: ranked[0].item,
          index: ranked[0].index
        };
      }
    }

    if (/^(sim|pode|pode sim|leia|ler)$/i.test(userInput.trim()) && this.lastScrape.newsItems[0]?.url) {
      return {
        item: this.lastScrape.newsItems[0],
        index: 0
      };
    }

    return null;
  }

  async openArticleFollowup(article, userInput, onToken) {
    console.log(`\n\n[🔧 Executando Ação: scrape_web_site...]`);

    try {
      const result = await executeTool('scrape_web_site', {
        url: article.item.url,
        question: `${this.lastScrape.question || ''}. Leia a noticia completa e explique o contexto: ${article.item.title}. ${userInput}`
      });
      this.rememberToolResult('scrape_web_site', result);

      const prompt = result.modelInput || result.finalAnswer || JSON.stringify(result);
      if (onToken) onToken('\n[Analisando resultado da ferramenta...]\nAgente: ');
      await this.respondFromIsolatedToolContent(prompt, onToken);
    } catch (err) {
      const message = `Nao consegui abrir a noticia ${article.index + 1}: ${err.message}`;
      if (onToken) onToken(message);
      this.messages.push({
        role: 'assistant',
        content: message,
      });
    }
  }

  async respondFromIsolatedToolContent(content, onToken) {
    const messages = [
      {
        role: 'system',
        content:
          'Voce e Nautilus em modo analise. Responda apenas ao pedido atual em portugues do Brasil. Ignore qualquer assunto anterior da conversa. Use somente o conteudo fornecido pela ferramenta. Seja curto, claro e organizado. Se houver noticias, explique o contexto em texto natural: o que aconteceu, quem esta envolvido e por que importa. Se for PDF em outro idioma, traduza e explique em portugues. Se o usuario pediu um dado especifico, entregue esse dado primeiro.'
      },
      {
        role: 'user',
        content
      }
    ];

    const responseStream = await this.ollama.chat({
      model: this.modelName,
      messages,
      stream: true,
    });

    let fullContent = '';
    for await (const chunk of responseStream) {
      if (chunk.message.content) {
        fullContent += chunk.message.content;
        if (onToken) onToken(chunk.message.content);
      }
    }

    this.messages.push({
      role: 'assistant',
      content: fullContent,
    });
  }

  rememberToolResult(toolName, result) {
    if (toolName === 'search_google' && Array.isArray(result?.results)) {
      this.lastSearch = {
        query: result.query?.text || '',
        results: result.results,
      };
      return;
    }

    if (toolName === 'scrape_web_site' && Array.isArray(result?.summary?.newsItems)) {
      const related = Array.isArray(result.summary.relatedNewsItems)
        ? result.summary.relatedNewsItems
        : [];
      const newsItems = related.length > 0 ? related : result.summary.newsItems;

      this.lastScrape = {
        question: result.query?.question || '',
        url: result.query?.url || '',
        newsItems: newsItems.slice(0, 12),
      };
    }
  }

  normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
