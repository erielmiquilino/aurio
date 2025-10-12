export function splitIntoParagraphs(input: string): string[] {
  const normalized = input.replace(/\r\n?/g, '\n');
  return normalized
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

export function chunkByLength(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) chunks.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}


