import type { TtsAudioChunk, TtsRequest } from '../lib/messaging';
import { extractText, extractHtmlWithReadability } from '../lib/readability';
import * as ttsHighlighter from './ttsHighlighter';

let audioEl: HTMLAudioElement | null = null;
let sourceUrl: string | null = null;
let playingRequestId: string | null = null;
type AudioQueueItem = { buf: ArrayBuffer; paragraphIndex: number | null; chunkIndex: number; totalChunks: number };
let queue: AudioQueueItem[] = [];
let isPlaying = false;
let isPaused = false;

function ensureAudio() {
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.style.display = 'none';
    document.documentElement.appendChild(audioEl);
    audioEl.addEventListener('ended', () => {
      playNext();
    });
    audioEl.addEventListener('error', (e) => {
      console.error('[TTS][content] audio error', e);
      if (audioEl?.error) {
        console.error('[TTS][content] media error code', audioEl.error.code);
      }
    });
  }
}

function sniffMimeFromData(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf.slice(0, 4));
  // ID3 tag for MP3 or 0xFFFB/0xFFF3 frames
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg';
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  // OGG header "OggS"
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio/ogg';
  // WAV header "RIFF"
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'audio/wav';
  return 'audio/mpeg';
}

function arrayBufferToBlobUrl(buf: ArrayBuffer): string {
  const mime = sniffMimeFromData(buf);
  const blob = new Blob([buf], { type: mime });
  return URL.createObjectURL(blob);
}

function playNext() {
  if (!audioEl) return;
  const next = queue.shift();
  if (!next) {
    console.log('[TTS][content] fila vazia, parando');
    isPlaying = false;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = null;
    return;
  }
  console.log('[TTS][content] playNext', { queueRemainingAfterShift: queue.length, audioSize: next.buf.byteLength, paragraphIndex: next.paragraphIndex, chunkIndex: next.chunkIndex });
  // Aplicar highlight somente quando o áudio vai começar a tocar
  if (typeof next.paragraphIndex === 'number' && next.chunkIndex === 0) {
    try {
      ttsHighlighter.highlightParagraph(next.paragraphIndex);
    } catch (_) { /* ignore */ }
  }
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = arrayBufferToBlobUrl(next.buf);
  audioEl.src = sourceUrl;
  isPlaying = true;
  console.log('[TTS][content] audio.src definido, chamando play()', { blobUrl: sourceUrl });
  audioEl.play().catch(err => {
    console.error('[TTS][content] autoplay/play error', err);
  });
}

function startPlayForRequest(requestId: string) {
  ensureAudio();
  playingRequestId = requestId;
  queue = [];
  playNext();
}

function extractSelectedOrAllText(): string {
  const sel = window.getSelection?.()?.toString();
  if (sel && sel.trim().length > 0) return sel.trim();
  return document.body?.innerText ?? '';
}

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (response?: any) => void) => {
  if (message.type === 'TTS_AUDIO_CHUNK') {
    const m = message as any; // Recebemos array de números, não TtsAudioChunk typed
    console.log('[TTS][content] TTS_AUDIO_CHUNK recebido (raw)', { requestId: m.requestId, chunkIndex: m.chunkIndex, totalChunks: m.totalChunks, audioType: typeof m.audio, audioIsArray: Array.isArray(m.audio), audioLen: m.audio?.length });
    
    // Converter array de bytes de volta para ArrayBuffer
    let audioBuffer: ArrayBuffer;
    if (m.audio instanceof ArrayBuffer) {
      audioBuffer = m.audio;
    } else if (Array.isArray(m.audio)) {
      // Recebemos array de números, converter para ArrayBuffer
      const uint8 = new Uint8Array(m.audio);
      audioBuffer = uint8.buffer;
    } else if (m.audio && typeof m.audio === 'object') {
      // Fallback: tentar converter objeto para array
      const uint8 = new Uint8Array(Object.values(m.audio));
      audioBuffer = uint8.buffer;
    } else {
      console.error('[TTS][content] formato de áudio inválido', typeof m.audio, m.audio);
      return;
    }
    
    console.log('[TTS][content] ArrayBuffer reconstruído', { requestId: m.requestId, chunkIndex: m.chunkIndex, audioSize: audioBuffer.byteLength });
    if (playingRequestId !== m.requestId) {
      console.log('[TTS][content] nova request, resetando fila', { oldReqId: playingRequestId, newReqId: m.requestId });
      startPlayForRequest(m.requestId);
    }
    // Empilhar com metadados para controlar highlight no momento do play
    queue.push({
      buf: audioBuffer,
      paragraphIndex: typeof m.paragraphIndex === 'number' ? m.paragraphIndex : null,
      chunkIndex: typeof m.chunkIndex === 'number' ? m.chunkIndex : -1,
      totalChunks: typeof m.totalChunks === 'number' ? m.totalChunks : -1
    });
    console.log('[TTS][content] chunk adicionado à fila', { queueLen: queue.length, isPlaying, paragraphIndex: m.paragraphIndex, chunkIndex: m.chunkIndex });
    if (!isPlaying) playNext();
  }
  if (message.type === 'PDF_DATA') {
    console.warn('[TTS][content] PDF_DATA recebido. Extração via pdf.js está desativada nesta versão.');
  }
  if (message.type === 'TTS_ERROR') {
    console.error('[TTS_ERROR]', message.message);
  }
  if (message.type === 'CONTENT_SPEAK') {
    const { voiceName, rate, pitch, useReadability } = message;
    console.log('[TTS][content] CONTENT_SPEAK recebido', { voiceName, rate, pitch, useReadability });
    requestSpeak(voiceName, rate, pitch, useReadability);
  }
  if (message.type === 'CONTENT_PREPARE') {
    const { voiceName, rate, pitch, useReadability } = message;
    console.log('[TTS][content] CONTENT_PREPARE recebido', { voiceName, rate, pitch, useReadability });
    prepareSpeak(voiceName, rate, pitch, useReadability);
  }
  if (message.type === 'CONTENT_STOP') {
    stopSpeak();
  }
  if (message.type === 'CONTENT_PAUSE') {
    pauseSpeak();
  }
  if (message.type === 'CONTENT_RESUME') {
    resumeSpeak();
  }
  if (message.type === 'CONTENT_READ_PDF') {
    const { voiceName, rate, pitch } = message;
    readPdf(voiceName, rate, pitch);
  }
  // Removido: agora o highlight é acionado no primeiro chunk de cada parágrafo
});

// Exposed helpers used by popup via scripting.executeScript
export function requestSpeak(voiceName: string, rate: string, pitch: string, useReadability = false) {
  const selection = window.getSelection()?.toString() || '';
  if (!selection) {
    console.log('[TTS][content] requestSpeak sem seleção → preparando mapeamento');
    prepareSpeak(voiceName, rate, pitch, useReadability);
    return;
  }
  const text = selection;
  console.log('[TTS][content] requestSpeak com seleção', { len: text.length, voiceName });
  const req: TtsRequest = {
    type: 'TTS_REQUEST',
    tabId: (window as any).chrome?.devtools ? -1 : (window as any).chrome?.tabs ? (window as any).chrome.tabs.TAB_ID_NONE : -1,
    requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    textBlocks: [text],
    voiceName,
    rate,
    pitch
  };
  chrome.runtime.sendMessage(req);
}

export async function prepareSpeak(voiceName: string, rate: string, pitch: string, useReadability = true) {
  try {
    const toSet: any = { useReadability };
    if (voiceName) toSet.defaultVoice = voiceName;
    if (rate) toSet.defaultRate = rate;
    if (pitch) toSet.defaultPitch = pitch;
    await chrome.storage.local.set(toSet);
  } catch (_) { /* ignore */ }
  const selection = window.getSelection()?.toString() || '';
  if (selection) {
    // Se há seleção, manter comportamento de leitura imediata
    requestSpeak(voiceName, rate, pitch, useReadability);
    return;
  }
  let articleHtml = '';
  if (useReadability) {
    const html = extractHtmlWithReadability();
    if (html) articleHtml = html;
  }
  if (!articleHtml) {
    // Fallback: usar body inteiro (mapeamento filtra pelo DOM principal)
    articleHtml = document.body?.innerHTML || '';
  }
  console.log('[TTS][content] preparando mapeamento', { htmlLen: articleHtml.length, useReadability });
  ttsHighlighter.initHighlighter(articleHtml);
}

export function stopSpeak() {
  chrome.runtime.sendMessage({ type: 'TTS_STOP', tabId: -1 });
  if (audioEl) audioEl.pause();
  // Limpar highlighter se estiver ativo
  if (ttsHighlighter.isActive()) {
    ttsHighlighter.cleanup();
  }
}

export function pauseSpeak() {
  chrome.runtime.sendMessage({ type: 'TTS_PAUSE', tabId: -1 });
  if (audioEl) audioEl.pause();
  isPaused = true;
}

export function resumeSpeak() {
  chrome.runtime.sendMessage({ type: 'TTS_RESUME', tabId: -1 });
  if (audioEl && isPaused) {
    audioEl.play();
    isPaused = false;
  }
}

export function readPdf(voiceName: string, rate: string, pitch: string) {
  console.warn('[TTS][content] Leitura de PDF está temporariamente desativada.');
}

// Expor no window para chamadas via scripting
// @ts-ignore
;(window as any).requestSpeak = requestSpeak;
// @ts-ignore
;(window as any).prepareSpeak = prepareSpeak;
// @ts-ignore
;(window as any).stopSpeak = stopSpeak;
// @ts-ignore
;(window as any).pauseSpeak = pauseSpeak;
// @ts-ignore
;(window as any).resumeSpeak = resumeSpeak;
// @ts-ignore
;(window as any).readPdf = readPdf;


