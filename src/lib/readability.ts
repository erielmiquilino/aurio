// Wrapper para @mozilla/readability com fallback para extração simples
import { Readability } from '@mozilla/readability';

export function extractTextWithReadability(): string | null {
  try {
    // Clone do document para evitar modificar a página original
    const documentClone = document.cloneNode(true) as Document;
    
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    if (article && article.textContent) {
      console.log('[TTS][readability] extração OK', { 
        title: article.title, 
        textLen: article.textContent.length,
        excerpt: article.excerpt?.substring(0, 100)
      });
      return article.textContent;
    } else {
      console.warn('[TTS][readability] parse retornou null');
      return null;
    }
  } catch (e) {
    console.error('[TTS][readability] erro ao extrair', e);
    return null;
  }
}

export function extractTextFallback(): string {
  // Fallback: extração simples do body
  const text = document.body.innerText || '';
  console.log('[TTS][readability] usando fallback', { textLen: text.length });
  return text;
}

export function extractText(useReadability: boolean): string {
  if (useReadability) {
    const readabilityText = extractTextWithReadability();
    if (readabilityText) return readabilityText;
  }
  return extractTextFallback();
}

