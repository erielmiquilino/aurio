import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractHtmlWithReadability,
  extractBestContentScopeHtml,
  extractText,
  extractTextFallback,
  extractTextWithReadability,
  getReadableHtmlStats,
  isUsefulArticleHtml
} from './readability';

describe('readability helpers', () => {
  beforeEach(() => {
    document.head.innerHTML = '<title>Readable Article</title>';
    document.body.innerHTML = '<main>Fallback text</main>';
    Object.defineProperty(document.body, 'innerText', {
      configurable: true,
      value: 'Fallback text'
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('returns article HTML when readability parses content', () => {
    document.body.innerHTML = `
      <article>
        <h1>Readable Article</h1>
        <p>Readable content with enough words to look like a real paragraph for extraction.</p>
        <p>Another readable paragraph with useful content for the parser.</p>
      </article>
    `;

    expect(extractHtmlWithReadability()).toContain('Readable content');
  });

  it('converts readable article HTML to text with paragraph breaks', () => {
    document.body.innerHTML = `
      <article>
        <h1>Title</h1>
        <p>First paragraph with enough text for readability to keep it.</p>
        <p>Second paragraph with another sentence for extraction.</p>
      </article>
    `;

    const text = extractTextWithReadability();

    expect(text).toContain('First paragraph');
    expect(text).toContain('Second paragraph');
  });

  it('returns null when readability cannot parse content', () => {
    document.body.innerHTML = '';

    expect(extractHtmlWithReadability()).toBeNull();
    expect(extractTextWithReadability()).toBeNull();
  });

  it('falls back to body text when readability is disabled or fails', () => {
    document.body.innerHTML = 'Fallback text';

    expect(extractTextFallback()).toBe('Fallback text');
    expect(extractText(false)).toBe('Fallback text');
    expect(extractText(true)).toBe('Fallback text');
  });

  it('handles readability exceptions with null/fallback results', () => {
    vi.spyOn(document, 'cloneNode').mockImplementation(() => {
      throw new Error('parse failed');
    });

    expect(extractHtmlWithReadability()).toBeNull();
    expect(extractTextWithReadability()).toBeNull();
    expect(extractText(true)).toBe('Fallback text');
  });

  it('detects sparse readability HTML when the page body has richer content', () => {
    const sparseHtml = `
      <p>07 de mai. de 2026Leitura de 1 min</p>
      <li>home</li>
      <li>produto</li>
    `;
    const richBodyHtml = `
      <article>
        <h1>NDD Frete</h1>
        <p>Esta e a base de conhecimento de Produto do NDD Frete para explicar regras de negocio e fluxos internos.</p>
        <p>Outro paragrafo completo com detalhes suficientes para ser considerado conteudo principal da pagina.</p>
      </article>
    `;

    expect(getReadableHtmlStats(sparseHtml)).toMatchObject({
      blocks: 3,
      meaningfulBlocks: 0
    });
    expect(isUsefulArticleHtml(sparseHtml, richBodyHtml)).toBe(false);
  });

  it('prefers a richer DOM scope even when readability returns valid but partial content', () => {
    const partialHtml = `
      <article>
        <h1>NDD Frete</h1>
        <p>Esta e a base de conhecimento de Produto do NDD Frete para explicar regras de negocio e conceitos principais.</p>
        <p>Uma segunda parte ainda valida, mas incompleta em relacao ao artigo renderizado.</p>
      </article>
    `;
    const richerScopeHtml = `
      <article>
        <h1>NDD Frete</h1>
        <p>Esta e a base de conhecimento de Produto do NDD Frete para explicar regras de negocio e conceitos principais.</p>
        <h2>Comece por aqui</h2>
        <li>Visao geral</li>
        <li>Mapa do produto</li>
        <h2>Features em estruturacao</h2>
        <li>Recepcao de documento originario</li>
        <p>Mais um trecho longo do artigo renderizado mantendo a mesma area de conteudo usada para os botoes.</p>
      </article>
    `;

    expect(isUsefulArticleHtml(partialHtml, richerScopeHtml)).toBe(false);
  });

  it('keeps short readability HTML when there is no richer fallback', () => {
    const shortHtml = '<article><h1>Aviso</h1><p>Texto curto, mas e o unico conteudo da pagina.</p></article>';

    expect(isUsefulArticleHtml(shortHtml, shortHtml)).toBe(true);
  });

  it('extracts the richest article HTML before broader page scopes', () => {
    document.body.innerHTML = `
      <article><p>Nota curta.</p></article>
      <main class="center">
        <article>
          <h1>NDD Frete</h1>
          <p>Esta e a base de conhecimento de Produto do NDD Frete para explicar regras de negocio.</p>
          <p>Outro paragrafo completo com conteudo da documentacao.</p>
        </article>
      </main>
    `;

    const html = extractBestContentScopeHtml();

    expect(html).toContain('base de conhecimento');
    expect(html).not.toContain('Nota curta');
  });
});
