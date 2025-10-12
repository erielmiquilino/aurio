import * as pdfjs from 'pdfjs-dist';
// Evitar uso de worker no content script (remove dependência de import.meta)
// Nota: impacta performance em PDFs grandes, mas simplifica o MVP
(pdfjs as any).GlobalWorkerOptions.workerSrc = undefined;
(pdfjs as any).disableWorker = true;

export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string[]> {
  const loadingTask = (pdfjs as any).getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((i: any) => i.str).join(' ');
    pages.push(strings);
  }
  return pages;
}


