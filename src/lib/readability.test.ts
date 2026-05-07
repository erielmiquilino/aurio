import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractHtmlWithReadability,
  extractText,
  extractTextFallback,
  extractTextWithReadability
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
});
