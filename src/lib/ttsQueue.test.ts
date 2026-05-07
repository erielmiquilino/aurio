import { describe, expect, it } from 'vitest';

import { countWords, createQueueItem } from './ttsQueue';

describe('countWords', () => {
  it('counts only non-empty whitespace-separated words', () => {
    expect(countWords('  uma   frase\ncom\tquatro  ')).toBe(4);
  });
});

describe('createQueueItem', () => {
  it('keeps word offsets aligned with each generated chunk', () => {
    const item = createQueueItem('alpha beta gamma delta epsilon zeta', 7, 18);

    expect(item.paragraphIndex).toBe(7);
    expect(item.chunks).toEqual([
      'alpha beta gamma',
      'delta epsilon zeta'
    ]);
    expect(item.wordOffsets).toEqual([0, 3]);
  });

  it('uses zero as the offset for a paragraph that fits in one chunk', () => {
    const item = createQueueItem('paragrafo curto', 2, 100);

    expect(item.chunks).toEqual(['paragrafo curto']);
    expect(item.wordOffsets).toEqual([0]);
  });
});
