import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDocumentMock = vi.hoisted(() => vi.fn());
const globalWorkerOptions = vi.hoisted(() => ({} as { workerSrc?: string }));

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: globalWorkerOptions,
  disableWorker: false,
  getDocument: getDocumentMock
}));

import { extractTextFromPdf } from './extract';

describe('extractTextFromPdf', () => {
  beforeEach(() => {
    getDocumentMock.mockReset();
  });

  it('extracts text from each PDF page in order', async () => {
    const getPage = vi.fn()
      .mockResolvedValueOnce({
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: 'First' }, { str: 'page' }]
        })
      })
      .mockResolvedValueOnce({
        getTextContent: vi.fn().mockResolvedValue({
          items: [{ str: 'Second' }, { str: 'page' }]
        })
      });

    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage
      })
    });

    const buffer = new ArrayBuffer(4);
    const pages = await extractTextFromPdf(buffer);

    expect(getDocumentMock).toHaveBeenCalledWith({ data: buffer });
    expect(getPage).toHaveBeenNthCalledWith(1, 1);
    expect(getPage).toHaveBeenNthCalledWith(2, 2);
    expect(pages).toEqual(['First page', 'Second page']);
  });

  it('returns an empty list for PDFs with no pages', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 0,
        getPage: vi.fn()
      })
    });

    await expect(extractTextFromPdf(new ArrayBuffer(0))).resolves.toEqual([]);
  });
});

