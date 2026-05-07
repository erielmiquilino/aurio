import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanup,
  clearHighlight,
  ensureWordWrap,
  highlightParagraph,
  highlightWord,
  initHighlighter,
  isActive,
  prepareSelectionWrap
} from './ttsHighlighter';

const rect = {
  x: 0,
  y: 0,
  width: 320,
  height: 24,
  top: 0,
  right: 320,
  bottom: 24,
  left: 0,
  toJSON: () => ({})
} as DOMRect;

function articleHtml(): string {
  return `
    <article>
      <h1>Titulo principal</h1>
      <p>Primeiro paragrafo com texto mapeavel.</p>
      <h2>Secao interna</h2>
      <ul>
        <li>Item de lista para leitura.</li>
      </ul>
    </article>
  `;
}

describe('ttsHighlighter', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn()
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({})
        }
      }
    });

    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: () => undefined
      });
    }

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('injects play buttons into mappable paragraphs, headings and list items', () => {
    document.body.innerHTML = articleHtml();

    initHighlighter(articleHtml());

    const mapped = document.querySelectorAll('[data-tts-paragraph-index]');
    const buttons = document.querySelectorAll<HTMLButtonElement>('.tts-paragraph-button');

    expect(mapped).toHaveLength(4);
    expect(buttons).toHaveLength(4);
    expect(document.querySelector('h1')?.getAttribute('data-tts-paragraph-index')).toBe('0');
    expect(document.querySelector('p')?.getAttribute('data-tts-paragraph-index')).toBe('1');
    expect(document.querySelector('h2')?.getAttribute('data-tts-paragraph-index')).toBe('2');
    expect(document.querySelector('li')?.getAttribute('data-tts-paragraph-index')).toBe('3');
    expect([...buttons].map(button => button.getAttribute('aria-label'))).toEqual([
      'Ler parágrafo 1',
      'Ler parágrafo 2',
      'Ler parágrafo 3',
      'Ler parágrafo 4'
    ]);
    expect(isActive()).toBe(true);
  });

  it('applies and clears paragraph highlighting classes', () => {
    document.body.innerHTML = articleHtml();
    initHighlighter(articleHtml());

    highlightParagraph(1);

    expect(document.querySelector('p')?.classList.contains('tts-reading')).toBe(true);

    highlightParagraph(3);

    expect(document.querySelector('p')?.classList.contains('tts-reading')).toBe(false);
    expect(document.querySelector('li')?.classList.contains('tts-reading')).toBe(true);

    clearHighlight(3);

    expect(document.querySelector('li')?.classList.contains('tts-reading')).toBe(false);
  });

  it('wraps paragraph words and highlights one word', () => {
    document.body.innerHTML = '<main><p>Uma frase curta para teste.</p></main>';
    initHighlighter('<main><p>Uma frase curta para teste.</p></main>');

    const wrap = ensureWordWrap(0);

    expect(wrap).not.toBeNull();
    expect(wrap?.words.map(word => word.textContent)).toEqual(['Uma', 'frase', 'curta', 'para', 'teste.']);
    expect(document.querySelectorAll('.tts-word')).toHaveLength(5);

    highlightWord(0, 2);

    expect(document.querySelector('.tts-word-reading')?.textContent).toBe('curta');
  });

  it('cleans buttons, attributes, classes, word spans and active state', () => {
    document.body.innerHTML = '<main><p>Texto limpo depois do cleanup.</p></main>';
    initHighlighter('<main><p>Texto limpo depois do cleanup.</p></main>');
    highlightParagraph(0);
    highlightWord(0, 1);

    cleanup();

    const paragraph = document.querySelector('p');
    expect(document.querySelector('.tts-paragraph-button')).toBeNull();
    expect(document.querySelector('[data-tts-paragraph-index]')).toBeNull();
    expect(document.querySelector('[data-tts-bound]')).toBeNull();
    expect(document.querySelector('.tts-reading')).toBeNull();
    expect(document.querySelector('.tts-word')).toBeNull();
    expect(document.querySelector('.tts-selection-wrap')).toBeNull();
    expect(paragraph?.textContent).toBe('Texto limpo depois do cleanup.');
    expect(isActive()).toBe(false);
  });

  it('wraps a simple DOM selection and cleanup restores the selected text', () => {
    document.body.innerHTML = '<main><p>Antes texto selecionado depois.</p></main>';
    const paragraph = document.querySelector('p');
    const textNode = paragraph?.firstChild;
    expect(textNode?.nodeType).toBe(Node.TEXT_NODE);

    const range = document.createRange();
    range.setStart(textNode as Text, 'Antes '.length);
    range.setEnd(textNode as Text, 'Antes texto selecionado'.length);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(prepareSelectionWrap()).toBe(true);
    expect(document.querySelector('.tts-selection-wrap')).not.toBeNull();
    expect([...document.querySelectorAll('.tts-word')].map(word => word.textContent)).toEqual([
      'texto',
      'selecionado'
    ]);
    expect(isActive()).toBe(true);

    cleanup();

    expect(document.querySelector('.tts-selection-wrap')).toBeNull();
    expect(document.querySelector('.tts-word')).toBeNull();
    expect(paragraph?.textContent).toBe('Antes texto selecionado depois.');
    expect(isActive()).toBe(false);
  });
});
