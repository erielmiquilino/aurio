// Wrapper para @mozilla/readability com fallback para extração simples
import { Readability } from '@mozilla/readability';

type ReadableHtmlStats = {
  blocks: number;
  meaningfulBlocks: number;
  textLength: number;
};

export function getReadableHtmlStats(html: string): ReadableHtmlStats {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const elements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
  let blocks = 0;
  let meaningfulBlocks = 0;
  let textLength = 0;
  elements.forEach(el => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    blocks++;
    textLength += text.length;
    if (text.length >= 40) meaningfulBlocks++;
  });
  return { blocks, meaningfulBlocks, textLength };
}

export function isUsefulArticleHtml(articleHtml: string, fallbackHtml = ''): boolean {
  const articleStats = getReadableHtmlStats(articleHtml);
  if (articleStats.blocks === 0 || articleStats.textLength === 0) return false;

  const fallbackStats = getReadableHtmlStats(fallbackHtml);
  const fallbackLooksRicher =
    (
      fallbackStats.blocks >= articleStats.blocks + 3 &&
      fallbackStats.meaningfulBlocks >= articleStats.meaningfulBlocks &&
      fallbackStats.textLength >= articleStats.textLength * 0.8
    ) ||
    (
      fallbackStats.meaningfulBlocks >= articleStats.meaningfulBlocks + 2 &&
      fallbackStats.textLength >= articleStats.textLength * 1.5
    );

  if (fallbackLooksRicher) return false;
  if (articleStats.meaningfulBlocks >= 2 && articleStats.textLength >= 120) return true;

  return !fallbackLooksRicher;
}

export function extractBestContentScopeHtml(doc: Document = document): string {
  const scopeSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.center article',
    '.center',
    '.article',
    '.post',
    '.entry-content',
    '#content',
    '.content'
  ];

  for (const selector of scopeSelectors) {
    let bestElement: Element | null = null;
    let bestStats: ReadableHtmlStats | null = null;
    const scopes = Array.from(doc.querySelectorAll(selector));
    for (const scope of scopes) {
      const stats = getReadableHtmlStats(scope.innerHTML);
      if (!bestStats || stats.blocks > bestStats.blocks) {
        bestElement = scope;
        bestStats = stats;
      }
    }
    if (bestElement && bestStats && bestStats.blocks > 0) return bestElement.innerHTML;
  }

  return doc.body?.innerHTML || '';
}

export function extractHtmlWithReadability(): string | null {
  try {
    // Clone do document para evitar modificar a página original
    const documentClone = document.cloneNode(true) as Document;
    
    const reader = new Readability(documentClone);
    const article = reader.parse();
    
    if (article && article.content) {
      console.log('[TTS][readability] extração HTML OK', { 
        title: article.title, 
        htmlLen: article.content.length,
        excerpt: article.excerpt?.substring(0, 100)
      });
      return article.content;
    } else {
      console.warn('[TTS][readability] parse retornou null');
      return null;
    }
  } catch (e) {
    console.error('[TTS][readability] erro ao extrair HTML', e);
    return null;
  }
}

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

