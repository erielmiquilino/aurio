// Offscreen document para processar PDFs com pdf.js
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Configurar worker do pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs');

console.log('[TTS][offscreen] inicializado');

chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (message.type === 'PDF_EXTRACT_REQUEST') {
    const { url } = message;
    console.log('[TTS][offscreen] PDF_EXTRACT_REQUEST recebido', { url });
    
    extractPdfText(url)
      .then(text => {
        console.log('[TTS][offscreen] PDF extraído', { textLen: text.length });
        sendResponse({ type: 'PDF_EXTRACT_RESPONSE', text, success: true });
      })
      .catch(error => {
        console.error('[TTS][offscreen] erro ao extrair PDF', error);
        sendResponse({ type: 'PDF_EXTRACT_RESPONSE', error: String(error), success: false });
      });
    
    return true; // Indica que responderemos de forma assíncrona
  }
});

async function extractPdfText(url: string): Promise<string> {
  console.log('[TTS][offscreen] carregando PDF', { url });
  
  const loadingTask = pdfjsLib.getDocument(url);
  const pdf: PDFDocumentProxy = await loadingTask.promise;
  
  console.log('[TTS][offscreen] PDF carregado', { numPages: pdf.numPages });
  
  let fullText = '';
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ');
    fullText += pageText + '\n';
    console.log('[TTS][offscreen] página extraída', { pageNum, pageTextLen: pageText.length });
  }
  
  console.log('[TTS][offscreen] extração completa', { totalLen: fullText.length, numPages: pdf.numPages });
  return fullText;
}

