// Wrapper para @mozilla/readability com fallback para extração simples
import { Readability } from '@mozilla/readability';

export function extractTextWithReadability(): string | null {
  try {
    // Clone do document para evitar modificar a página original
    const documentClone = document.cloneNode(true) as Document;
    
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    if (article && article.content) {
      // Usar article.content (HTML) para preservar estrutura de parágrafos
      // Converter HTML para texto preservando quebras de parágrafos
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = article.content;
      
      // Adicionar quebras de linha duplas entre parágrafos, headers, listas
      const blockElements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, div, blockquote, pre');
      blockElements.forEach(el => {
        // Adicionar marcador de parágrafo após cada elemento de bloco
        el.textContent = (el.textContent || '').trim() + '\n\n';
      });
      
      const text = tempDiv.innerText || tempDiv.textContent || '';
      const cleanedText = text.replace(/\n{3,}/g, '\n\n').trim(); // Limitar quebras consecutivas
      
      console.log('[TTS][readability] extração OK', { 
        title: article.title, 
        textLen: cleanedText.length,
        excerpt: article.excerpt?.substring(0, 100),
        paragraphs: cleanedText.split('\n\n').length
      });
      return cleanedText;
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

