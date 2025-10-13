# Aurio TTS — Extensão Chrome

Leitor de páginas e PDFs com voz natural usando Azure AI Speech. Permite ler a página inteira, a seleção atual ou PDFs abertos na guia.

## Instalação (dev)

- **Requisitos**: Node 18+, pnpm/npm, conta Azure com Speech habilitado.
- Instale deps e gere `dist/`:
  - `npm install`
  - `npm run build`
- No Chrome: `chrome://extensions` → Ativar modo desenvolvedor → Carregar sem empacotamento → selecione a pasta do projeto.

## Configuração (Azure Speech)

No menu da extensão, abra `Options` e informe:

- `Azure Region` (ex.: `eastus`)
- `Azure Key` (chave do recurso Speech)

As vozes são listadas via API e o TTS é feito com SSML ajustando `rate` e `pitch`.

## Uso rápido

- Popup: escolher voz, velocidade, tom; clicar em "Ler página" ou "Ler seleção".
- Context menu: clicar com botão direito → "Ler seleção"/"Mapear parágrafos desta página"/"Ler PDF desta guia".
- Atalhos (configuráveis):
  - Pausar: Alt+Shift+P
  - Retomar: Alt+Shift+R
  - Parar: Alt+Shift+S

## Permissões e por quê

- `activeTab`, `tabs`, `scripting`: injetar e controlar a leitura na guia ativa.
- `storage`: salvar credenciais e preferências (voz, rate, pitch, contadores).
- `contextMenus`: ações rápidas via menu.
- `offscreen`: processar PDFs com `pdf.js` em contexto offscreen.
- `host_permissions`: `https://*.tts.speech.microsoft.com/*` para Azure; `<all_urls>` para leitura de conteúdo.

## Arquitetura

- `background` (`serviceWorker`): orquestra fila TTS, cache de áudio, comandos, PDF offscreen.
- `content`: recebe chunks de áudio, toca e sincroniza destaque/estado.
- `popup` e `options`: UI de controle e configuração.
- `offscreen`: extrai texto de PDF com `pdf.js` e responde ao background.

## Build

- Desenvolvimento: `npm run dev` (watch) e recarregar a extensão.
- Produção: `npm run build` gera `dist/` com `manifest.json`, bundles e páginas.

## Licença

Este projeto usa The Unlicense (domínio público). Ver `LICENSE`.

— Conteúdo gerado por IA e pode conter erros.
