import { describe, expect, it } from 'vitest';
import { chunkByLength, splitIntoParagraphs } from './chunkText';

describe('splitIntoParagraphs', () => {
  it('normalizes CRLF line endings and trims paragraphs', () => {
    const text = '  First paragraph\r\nstill first\r\n\r\nSecond paragraph  \r\n\r\n  Third paragraph  ';

    expect(splitIntoParagraphs(text)).toEqual([
      'First paragraph\nstill first',
      'Second paragraph',
      'Third paragraph'
    ]);
  });

  it('drops empty paragraphs, including whitespace-only blank lines', () => {
    const text = '\r\n\r\n  Alpha  \r\n   \r\n\t\r\n  Beta\r\n\r\n';

    expect(splitIntoParagraphs(text)).toEqual(['Alpha', 'Beta']);
  });
});

describe('chunkByLength', () => {
  it('keeps text shorter than the limit as one chunk', () => {
    expect(chunkByLength('short text', 50)).toEqual(['short text']);
  });

  it('splits longer text on word boundaries', () => {
    expect(chunkByLength('alpha beta gamma delta', 12)).toEqual([
      'alpha beta',
      'gamma delta'
    ]);
  });

  it('handles many words across several chunks', () => {
    expect(chunkByLength('one two three four five six', 10)).toEqual([
      'one two',
      'three four',
      'five six'
    ]);
  });

  it('keeps a single word larger than maxChars intact', () => {
    expect(chunkByLength('supercalifragilistic small', 8)).toEqual([
      'supercalifragilistic',
      'small'
    ]);
  });
});
