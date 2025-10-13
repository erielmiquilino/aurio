import type { TtsPlayParagraph } from '../lib/messaging';

type ParagraphBlock = {
  index: number;
  text: string;
};

let paragraphBlocks: ParagraphBlock[] = [];
let isInitialized = false;
let insertedButtons: HTMLButtonElement[] = [];
const STYLE_ID = 'tts-highlighter-style';

function normalizeText(t: string): string {
  if (!t) return '';
  let s = t;
  // normalizar espaços e NBSP
  s = s.replace(/\u00a0/g, ' ');
  // normalizar aspas curvas e travessões
  s = s
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u00AB\u00BB]/g, '"');
  // remover diacríticos
  try {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch (_) { /* ignore */ }
  // compactar espaços e minúsculas
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s;
}

function isVisible(el: Element): boolean {
  const rect = (el as HTMLElement).getBoundingClientRect?.();
  const style = window.getComputedStyle(el as HTMLElement);
  return !!rect && rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

/**
 * Parseia o HTML do artigo e retorna textos de parágrafos em ordem
 */
function parseHtmlToParagraphTexts(html: string): ParagraphBlock[] {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const blocks: ParagraphBlock[] = [];
  const elements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
  let idx = 0;
  elements.forEach((el) => {
    const text = normalizeText(el.textContent || '');
    if (text.length > 0) {
      blocks.push({ index: idx++, text });
    }
  });
  console.log('[TTS][highlighter] parseado', { totalBlocks: blocks.length });
  return blocks;
}

function createPlayButton(index: number): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'tts-paragraph-button';
  button.setAttribute('data-tts-button', index.toString());
  button.setAttribute('aria-label', `Ler parágrafo ${index + 1}`);
  button.innerHTML = '🔊';
  button.title = `Ler a partir deste parágrafo`;
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handlePlayButtonClick(index);
  });
  return button;
}

async function handlePlayButtonClick(paragraphIndex: number) {
  console.log('[TTS][highlighter] botão clicado', { paragraphIndex });
  const result = await chrome.storage.local.get(['defaultVoice', 'defaultRate', 'defaultPitch']);
  const voiceName = result.defaultVoice || 'pt-BR-FranciscaNeural';
  const rate = result.defaultRate || '0%';
  const pitch = result.defaultPitch || '+0Hz';
  const textBlocks = paragraphBlocks
    .slice(paragraphIndex)
    .map(block => block.text);
  const message: TtsPlayParagraph = {
    type: 'TTS_PLAY_PARAGRAPH',
    tabId: -1,
    requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    paragraphIndex,
    textBlocks,
    voiceName,
    rate,
    pitch
  };
  console.log('[TTS][highlighter] enviando TTS_PLAY_PARAGRAPH', {
    paragraphIndex,
    totalBlocks: textBlocks.length,
    voiceName
  });
  chrome.runtime.sendMessage(message);
}

type Candidate = { el: HTMLElement; norm: string };

function collectCandidates(): Candidate[] {
  const scopeSelectors = [
    'article', 'main', '[role="main"]', '.article', '.post', '.entry-content', '#content', '.content'
  ];
  let scope: Element | Document = document;
  for (const sel of scopeSelectors) {
    const candidate = document.querySelector(sel);
    if (candidate) { scope = candidate; break; }
  }
  const nodeList = (scope as Element | Document).querySelectorAll?.('p, h1, h2, h3, h4, h5, h6, li');
  const list: Candidate[] = [];
  if (!nodeList) return list;
  for (const node of nodeList as any) {
    const el = node as HTMLElement;
    if (!isVisible(el)) continue;
    if (el.hasAttribute('data-tts-bound')) continue;
    const norm = normalizeText(el.textContent || '');
    if (norm.length === 0) continue;
    list.push({ el, norm });
  }
  return list;
}

function injectButtonsInPage(articleHtml: string) {
  const blocks = parseHtmlToParagraphTexts(articleHtml);
  paragraphBlocks = blocks;
  insertedButtons.forEach(btn => btn.remove());
  insertedButtons = [];

  // Pré-coletar candidatos do DOM
  let candidates = collectCandidates();
  console.log('[TTS][highlighter] candidatos no DOM', { candidates: candidates.length });
  const totalBlocks = blocks.length;
  let mapped = 0;

  // Matching sequencial com similaridade
  let candStart = 0;
  const sim = (a: string, b: string): number => {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 12 || b.length < 12) return a.includes(b) || b.includes(a) ? 1 : 0;
    const aTokens = new Set(a.split(' '));
    const bTokens = new Set(b.split(' '));
    let inter = 0;
    aTokens.forEach(t => { if (bTokens.has(t)) inter++; });
    const union = aTokens.size + bTokens.size - inter;
    return union === 0 ? 0 : inter / union;
  };

  for (let i = 0; i < totalBlocks; i++) {
    const raw = blocks[i].text;
    const blockNorm = normalizeText(raw);
    const snippetLen = Math.min(80, Math.max(24, Math.floor(blockNorm.length * 0.4)));
    const snippet = blockNorm.slice(0, snippetLen);
    let bestJ = -1;
    let bestScore = 0;
    for (let j = candStart; j < candidates.length; j++) {
      const cand = candidates[j];
      if (snippet && cand.norm.includes(snippet)) { bestJ = j; bestScore = 1; break; }
      const score = sim(blockNorm, cand.norm);
      if (score > bestScore) { bestScore = score; bestJ = j; }
    }
    const minScore = blockNorm.length < 40 ? 0.2 : 0.35;
    if (bestJ >= 0 && bestScore >= minScore) {
      const el = candidates[bestJ].el;
      el.setAttribute('data-tts-paragraph-index', String(i));
      el.setAttribute('data-tts-bound', '1');
      const btn = createPlayButton(i);
      el.insertBefore(btn, el.firstChild);
      insertedButtons.push(btn);
      mapped++;
      candStart = bestJ + 1;
      candidates = candidates.slice(candStart);
      candStart = 0;
      console.log('[TTS][highlighter] botão injetado', { index: i, tag: el.tagName, score: Number(bestScore.toFixed(2)), snippet });
    }
  }

  if (mapped < totalBlocks) {
    console.warn('[TTS][highlighter] alguns parágrafos não foram mapeados', { mapped, total: totalBlocks });
  }
  isInitialized = true;
}

export function highlightParagraph(index: number) {
  // Remover destaque anterior
  const previous = document.querySelector('.tts-reading');
  if (previous) previous.classList.remove('tts-reading');
  const target = document.querySelector(`[data-tts-paragraph-index="${index}"]`);
  if (target) {
    target.classList.add('tts-reading');
    (target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    console.log('[TTS][highlighter] highlight aplicado', { index });
  } else {
    console.warn('[TTS][highlighter] parágrafo não encontrado para highlight', { index });
  }
}

export function clearHighlight(index: number) {
  const target = document.querySelector(`[data-tts-paragraph-index="${index}"]`);
  if (target) {
    target.classList.remove('tts-reading');
    console.log('[TTS][highlighter] highlight removido', { index });
  }
}

/**
 * Inicializa o sistema injetando botões diretamente no DOM da página
 */
export function initHighlighter(articleHtml: string) {
  if (isInitialized) cleanup();
  console.log('[TTS][highlighter] iniciando mapeamento in-page', { htmlLen: articleHtml.length });
  ensureStyleInjected();
  injectButtonsInPage(articleHtml);
  console.log('[TTS][highlighter] mapeamento concluído', { totalParagraphs: paragraphBlocks.length });
}

export function cleanup() {
  console.log('[TTS][highlighter] limpando');
  document.querySelectorAll('[data-tts-paragraph-index]').forEach(el => {
    el.removeAttribute('data-tts-paragraph-index');
    el.classList.remove('tts-reading');
  });
  document.querySelectorAll('[data-tts-bound]')
    .forEach(el => el.removeAttribute('data-tts-bound'));
  insertedButtons.forEach(btn => btn.remove());
  insertedButtons = [];
  paragraphBlocks = [];
  isInitialized = false;
  console.log('[TTS][highlighter] limpo');
}

export function isActive(): boolean {
  return isInitialized;
}

function ensureStyleInjected() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.tts-paragraph-button{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;margin-right:8px;background:var(--accent-color,#1976d2);border:none;border-radius:50%;cursor:pointer;opacity:.7;transition:opacity .2s,transform .1s;vertical-align:middle;font-size:14px;padding:0;position:relative;top:-2px}
.tts-paragraph-button:hover{opacity:1;transform:scale(1.1)}
.tts-reading{background-color:#fff3cd !important;box-shadow:0 0 0 4px #fff3cd;border-radius:4px;transition:background-color .3s,box-shadow .3s;padding:8px;margin:4px 0}
@media (prefers-color-scheme: dark){.tts-reading{background-color:#4a4a2e !important;box-shadow:0 0 0 4px #4a4a2e}}
`;
  document.head.appendChild(style);
  console.log('[TTS][highlighter] estilos injetados');
}

