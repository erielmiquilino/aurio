import { chunkByLength } from './chunkText';

export type QueueItem = {
  paragraphIndex: number;
  chunks: string[];
  wordOffsets: number[];
};

export function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

export function createQueueItem(text: string, paragraphIndex: number, maxChars = 1000): QueueItem {
  const chunks = chunkByLength(text, maxChars);
  let offset = 0;
  const wordOffsets = chunks.map(chunk => {
    const current = offset;
    offset += countWords(chunk);
    return current;
  });
  return { paragraphIndex, chunks, wordOffsets };
}
