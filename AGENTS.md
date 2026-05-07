# AGENTS.md

Guia para agentes trabalhando neste repositório.

## Visão geral

Aurio TTS é uma extensão Chrome Manifest V3 para leitura de páginas, seleções e PDFs usando Azure AI Speech. O projeto usa TypeScript, Vite 5 e React 18 apenas nas telas de popup e options.

Fluxo principal:

- `src/background/serviceWorker.ts`: service worker da extensão; coordena fila de TTS, comandos, menus de contexto, cache de áudio, PDF offscreen e comunicação com abas.
- `src/content/index.ts`: content script injetado nas páginas; coleta texto, controla reprodução no documento e expõe ações para popup/comandos.
- `src/content/ttsHighlighter.ts`: sincronização visual de parágrafos/destaques durante a leitura.
- `src/lib/*`: utilitários compartilhados, incluindo Azure TTS, mensagens, cache, chunking e Readability.
- `src/popup/*` e `src/options/*`: interfaces React da extensão.
- `src/offscreen/*` e `src/pdf/*`: extração/processamento de PDF com `pdf.js`.
- `manifest.json`: permissões, comandos, content scripts, offscreen e páginas da extensão.
- `vite.config.ts`: build multi-entry e cópia de `manifest.json` e `pdf.worker.min.mjs` para `dist/`.

## Comandos

Use npm, pois o repositório contém `package-lock.json`.

```bash
npm install
npm run dev
npm run build
npm run preview
```

- `npm run dev`: executa `vite build --watch --mode development --sourcemap`. Depois de mudanças, recarregue a extensão em `chrome://extensions`.
- `npm run build`: gera `dist/` para carregar no Chrome.
- `npm run preview`: pré-visualização Vite; não substitui teste real da extensão.

Não há suíte de testes automatizada configurada neste momento. Para mudanças relevantes, rode `npm run build` e valide manualmente no Chrome.

## Validação manual recomendada

Depois de alterar comportamento da extensão:

1. Rode `npm run build`.
2. Abra `chrome://extensions`, ative modo desenvolvedor e carregue/recarregue a pasta do projeto.
3. Configure `Azure Region` e `Azure Key` em Options.
4. Teste pelo popup:
   - listar vozes;
   - ler página;
   - ler seleção;
   - ajustar voz, velocidade e tom.
5. Teste menus de contexto:
   - `Ler seleção`;
   - `Mapear parágrafos desta página`;
   - `Ler PDF desta guia`.
6. Teste atalhos:
   - pausar: `Alt+Shift+P`;
   - retomar: `Alt+Shift+R`;
   - parar: `Alt+Shift+S`.
7. Para PDF, confirme que `dist/pdf.worker.min.mjs` foi copiado pelo build.

## Convenções de código

- TypeScript estrito (`strict: true`) com módulos ES.
- Prefira tipos explícitos para mensagens e payloads compartilhados em `src/lib/messaging.ts`.
- Mantenha nomes claros e comentários apenas quando ajudarem a entender decisões não óbvias.
- Evite novas dependências sem necessidade real.
- Preserve a separação entre background, content script, popup/options e offscreen.
- Ao adicionar uma nova mensagem entre contextos da extensão, atualize o tipo union `Messages` e todos os pontos de envio/recebimento afetados.
- Para UI, siga o estilo existente em `src/styles/global.css` e nos componentes React atuais.

## Cuidados com Manifest V3

- O background é service worker, então não dependa de estado em memória como fonte durável. Use `chrome.storage.local` quando o dado precisar sobreviver a reinicializações.
- APIs de página não estão disponíveis diretamente no service worker. Use mensagens, `chrome.scripting.executeScript` ou offscreen document conforme o caso.
- Content scripts rodam no contexto da página ativa; trate páginas sem DOM comum, PDFs e sites com CSP/iframes com cuidado.
- Mudanças em permissões ou `host_permissions` devem ser justificadas no PR e refletidas no README se afetarem o usuário.
- O `dist/` é artefato de build e não deve ser commitado.

## Azure Speech e segurança

- Credenciais Azure são salvas em `chrome.storage.local` pela tela de Options.
- Nunca coloque chaves reais, tokens ou segredos em código, documentação, commits ou fixtures.
- Endpoints usados:
  - listar vozes: `https://{region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
  - sintetizar áudio: `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`.
- O SSML é montado em `src/lib/azureTts.ts`; mantenha escape de texto e normalização de `rate`/`pitch` ao alterar esse fluxo.

## Pull requests e commits

- Mantenha mudanças pequenas e objetivas.
- Rode `npm run build` antes de abrir PR quando houver alteração de código.
- Descreva impacto funcional e validação manual realizada.
- Use The Unlicense para novos arquivos, conforme o projeto.

