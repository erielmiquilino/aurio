import { buildSsml, listVoices, synthesize, AzureCredentials } from '../lib/azureTts';
import type { Messages, TtsRequest, GetVoices, TtsStop, TtsPause, TtsResume, ReadPdf, PdfData } from '../lib/messaging';
import { chunkByLength, splitIntoParagraphs } from '../lib/chunkText';
import * as audioCache from '../lib/audioCache';

type QueueItem = {
  paragraphIndex: number;
  chunks: string[];
};

type TabQueue = {
  requestId: string;
  items: QueueItem[];
  voiceName: string;
  rate: string;
  pitch: string;
  playing: boolean;
  paused: boolean;
};

const tabIdToQueue = new Map<number, TabQueue>();

// Contador de caracteres
let sessionChars = 0;

async function incrementCharCount(chars: number) {
  sessionChars += chars;
  const result = await chrome.storage.local.get(['totalChars']);
  const totalChars = (result.totalChars || 0) + chars;
  await chrome.storage.local.set({ totalChars });
  console.log('[TTS][bg] chars sintetizados', { added: chars, session: sessionChars, total: totalChars });
}

function updateBadge(tabId: number, state: 'playing' | 'paused' | 'stopped') {
  const badges = { playing: '🔊', paused: '⏸️', stopped: '' };
  chrome.action.setBadgeText({ text: badges[state], tabId });
  console.log('[TTS][bg] badge atualizado', { tabId, state, icon: badges[state] });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'speak-selection', title: 'Ler seleção', contexts: ['selection'] });
  chrome.contextMenus.create({ id: 'speak-page', title: 'Ler página', contexts: ['page'] });
  chrome.contextMenus.create({ id: 'speak-pdf', title: 'Ler PDF desta guia', contexts: ['page'] });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  const tabId = tab.id;
  if (info.menuItemId === 'speak-selection') {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        window.requestSpeak?.(undefined, undefined, undefined);
      }
    });
  }
  if (info.menuItemId === 'speak-page') {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        window.requestSpeak?.(undefined, undefined, undefined);
      }
    });
  }
  if (info.menuItemId === 'speak-pdf') {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        window.readPdf?.(undefined, undefined, undefined);
      }
    });
  }
});

chrome.commands?.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const tabId = tab.id;
  if (command === 'pause') {
    await chrome.scripting.executeScript({ target: { tabId }, func: () => { /* @ts-ignore */ window.pauseSpeak?.(); } });
  } else if (command === 'resume') {
    await chrome.scripting.executeScript({ target: { tabId }, func: () => { /* @ts-ignore */ window.resumeSpeak?.(); } });
  } else if (command === 'stop') {
    await chrome.scripting.executeScript({ target: { tabId }, func: () => { /* @ts-ignore */ window.stopSpeak?.(); } });
  }
});

async function getCredentials(): Promise<AzureCredentials | null> {
  return new Promise(resolve => {
    chrome.storage.local.get(['azureRegion', 'azureKey'], (res) => {
      if (res.azureRegion && res.azureKey) {
        console.log('[TTS][bg] credenciais carregadas', res.azureRegion);
        resolve({ region: res.azureRegion, key: res.azureKey });
      } else {
        console.warn('[TTS][bg] credenciais ausentes no storage');
        resolve(null);
      }
    });
  });
}

async function getDefaults(): Promise<{ voice: string; rate: string; pitch: string }> {
  return new Promise(resolve => {
    chrome.storage.local.get(['defaultVoice', 'defaultRate', 'defaultPitch'], (res) => {
      const voice = res.defaultVoice || 'pt-BR-FranciscaNeural';
      const rate = res.defaultRate || '0%';
      const pitch = res.defaultPitch || '+0Hz';
      resolve({ voice, rate, pitch });
    });
  });
}

async function handleGetVoices(_: GetVoices, sender: chrome.runtime.MessageSender) {
  const creds = await getCredentials();
  if (!creds) {
    chrome.runtime.sendMessage({ type: 'VOICES_ERROR', message: 'Credenciais ausentes' });
    console.error('[TTS][bg] GET_VOICES sem credenciais');
    return;
  }
  try {
    console.log('[TTS][bg] buscando vozes...');
    const voices = await listVoices(creds);
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, { type: 'VOICES_LIST', voices });
    } else {
      chrome.runtime.sendMessage({ type: 'VOICES_LIST', voices });
    }
  } catch (e) {
    console.error('[TTS][bg] falha ao listar vozes', e);
    if (sender.tab?.id) {
      chrome.tabs.sendMessage(sender.tab.id, { type: 'VOICES_ERROR', message: String(e) });
    } else {
      chrome.runtime.sendMessage({ type: 'VOICES_ERROR', message: String(e) });
    }
  }
}

async function produceAudioForTab(tabId: number) {
  const queue = tabIdToQueue.get(tabId);
  if (!queue) return;
  const creds = await getCredentials();
  if (!creds) {
    console.error('[TTS][bg] sintetizar sem credenciais');
    chrome.tabs.sendMessage(tabId, { type: 'TTS_ERROR', message: 'Credenciais do Azure ausentes. Abra Options e salve região/chave.' });
    return;
  }
  queue.playing = true;
  updateBadge(tabId, 'playing');
  for (let i = 0; i < queue.items.length; i++) {
    if (!queue.playing) break;
    const item = queue.items[i];
    for (let j = 0; j < item.chunks.length; j++) {
      // Pause handling
      while (queue.paused && queue.playing) {
        await new Promise(r => setTimeout(r, 150));
      }
      if (!queue.playing) break;
      const ssml = buildSsml(item.chunks[j], queue.voiceName, queue.rate, queue.pitch);
      try {
        // Tentar buscar no cache primeiro
        const cachedAudio = await audioCache.get(item.chunks[j], queue.voiceName);
        let data: ArrayBuffer;
        
        if (cachedAudio) {
          data = cachedAudio;
          console.log('[TTS][bg] usando áudio do cache', { tabId, paragraph: i, chunk: j, audioSize: data.byteLength });
        } else {
          console.log('[TTS][bg] sintetizando', { tabId, paragraph: i, chunk: j, voice: queue.voiceName, textLen: item.chunks[j].length });
          const result = await synthesize(creds, ssml);
          data = result.data;
          console.log('[TTS][bg] áudio sintetizado OK', { tabId, paragraph: i, chunk: j, audioSize: data.byteLength, contentType: result.contentType });
          await incrementCharCount(item.chunks[j].length);
          // Salvar no cache
          await audioCache.set(item.chunks[j], queue.voiceName, data);
        }
        // Converter ArrayBuffer para Array de bytes para serialização via Chrome messaging
        const audioArray = Array.from(new Uint8Array(data));
        try {
          await chrome.tabs.sendMessage(tabId, {
            type: 'TTS_AUDIO_CHUNK',
            requestId: queue.requestId,
            chunkIndex: j,
            totalChunks: item.chunks.length,
            audio: audioArray
          });
          console.log('[TTS][bg] TTS_AUDIO_CHUNK enviado', { tabId, paragraph: i, chunk: j, audioArrayLen: audioArray.length });
        } catch (sendErr) {
          console.error('[TTS][bg] erro ao enviar TTS_AUDIO_CHUNK', sendErr);
        }
        await new Promise(r => setTimeout(r, 10));
      } catch (e) {
        console.error('[TTS][bg] erro na síntese', e);
        chrome.tabs.sendMessage(tabId, { type: 'TTS_ERROR', message: String(e) });
        queue.playing = false;
        break;
      }
    }
    chrome.tabs.sendMessage(tabId, {
      type: 'TTS_PROGRESS',
      requestId: queue.requestId,
      paragraphIndex: i + 1,
      totalParagraphs: queue.items.length
    });
  }
  queue.playing = false;
  updateBadge(tabId, 'stopped');
}

function handleTtsRequest(msg: TtsRequest, sender: chrome.runtime.MessageSender) {
  const tabId = sender.tab?.id ?? msg.tabId;
  if (tabId == null) {
    console.error('[TTS][bg] handleTtsRequest sem tabId');
    return;
  }
  (async () => {
    const defaults = await getDefaults();
    const voiceName = msg.voiceName || defaults.voice;
    const rate = msg.rate || defaults.rate;
    const pitch = msg.pitch || defaults.pitch;
    const paragraphs = msg.textBlocks.flatMap(p => splitIntoParagraphs(p));
    console.log('[TTS][bg] nova requisição', { tabId, paragraphs: paragraphs.length, voiceName, rate, pitch });
    const items: QueueItem[] = paragraphs.map((p) => ({
      paragraphIndex: 0,
      chunks: chunkByLength(p, 1000)
    }));
    tabIdToQueue.set(tabId, {
      requestId: msg.requestId,
      items,
      voiceName,
      rate,
      pitch,
      playing: false,
      paused: false
    });
    produceAudioForTab(tabId);
  })();
}

function handleStop(msg: TtsStop) {
  const q = tabIdToQueue.get(msg.tabId);
  if (q) {
    q.playing = false;
    updateBadge(msg.tabId, 'stopped');
  }
  console.log('[TTS][bg] stop', msg.tabId);
}

function handlePause(msg: TtsPause) {
  const q = tabIdToQueue.get(msg.tabId);
  if (q) {
    q.paused = true;
    updateBadge(msg.tabId, 'paused');
  }
  console.log('[TTS][bg] pause', msg.tabId);
}

function handleResume(msg: TtsResume) {
  const q = tabIdToQueue.get(msg.tabId);
  if (q) {
    q.paused = false;
    updateBadge(msg.tabId, 'playing');
  }
  console.log('[TTS][bg] resume', msg.tabId);
}

chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_VOICES':
      handleGetVoices(message as GetVoices, sender);
      break;
    case 'TTS_REQUEST':
      handleTtsRequest(message as TtsRequest, sender);
      break;
    case 'TTS_STOP':
      handleStop(message as TtsStop);
      break;
    case 'TTS_PAUSE':
      handlePause(message as TtsPause);
      break;
    case 'TTS_RESUME':
      handleResume(message as TtsResume);
      break;
    case 'READ_PDF':
      handleReadPdf(message as ReadPdf, sender);
      break;
    case 'GET_SESSION_CHARS':
      sendResponse({ sessionChars });
      return true;
    case 'GET_TOTAL_CHARS':
      chrome.storage.local.get('totalChars', (res) => {
        sendResponse({ totalChars: res.totalChars ?? 0 });
      });
      return true;
    case 'RESET_TOTAL_CHARS':
      chrome.storage.local.set({ totalChars: 0 }, () => {
        sendResponse({ success: true });
      });
      return true;
    case 'GET_CACHE_SIZE':
      (async () => {
        const size = await audioCache.getSize();
        console.log('[TTS][bg] tamanho do cache', { bytes: size, mb: (size / 1024 / 1024).toFixed(2) });
        sendResponse({ size });
      })();
      return true;
    case 'CLEAR_CACHE':
      (async () => {
        await audioCache.clear();
        console.log('[TTS][bg] cache limpo');
        sendResponse({ success: true });
      })();
      return true;
    default:
      break;
  }
  return true;
});

async function handleReadPdf(msg: ReadPdf, sender: chrome.runtime.MessageSender) {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  try {
    const tab = sender.tab!;
    const url = tab.url;
    if (!url) throw new Error('Sem URL da aba.');
    
    console.log('[TTS][bg] criando offscreen document para PDF', { url });
    
    // Criar offscreen document se não existir
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as any]
    });
    
    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'src/offscreen/index.html',
        reasons: ['WORKERS' as any],
        justification: 'Processar PDF com pdf.js worker'
      });
      console.log('[TTS][bg] offscreen document criado');
    }
    
    // Enviar mensagem para o offscreen document extrair o PDF
    const response: any = await chrome.runtime.sendMessage({
      type: 'PDF_EXTRACT_REQUEST',
      url
    });
    
    if (response?.success && response.text) {
      console.log('[TTS][bg] PDF extraído via offscreen', { textLen: response.text.length });
      
      // Criar TTS request com o texto extraído
      const req: TtsRequest = {
        type: 'TTS_REQUEST',
        tabId,
        requestId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        textBlocks: [response.text],
        voiceName: msg.voiceName,
        rate: msg.rate,
        pitch: msg.pitch
      };
      
      await handleTtsRequest(req, sender);
    } else {
      throw new Error(response?.error || 'Falha ao extrair PDF');
    }
  } catch (e) {
    console.error('[TTS][bg] erro ao processar PDF', e);
    if (sender.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { type: 'TTS_ERROR', message: String(e) });
  }
}


