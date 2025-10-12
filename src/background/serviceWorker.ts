import { buildSsml, listVoices, synthesize, AzureCredentials } from '../lib/azureTts';
import type { Messages, TtsRequest, GetVoices, TtsStop, TtsPause, TtsResume, ReadPdf, PdfData } from '../lib/messaging';
import { chunkByLength, splitIntoParagraphs } from '../lib/chunkText';

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
        console.log('[TTS][bg] sintetizando', { tabId, paragraph: i, chunk: j, voice: queue.voiceName, textLen: item.chunks[j].length });
        const { data, contentType } = await synthesize(creds, ssml);
        console.log('[TTS][bg] áudio sintetizado OK', { tabId, paragraph: i, chunk: j, audioSize: data.byteLength, contentType });
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
  if (q) q.playing = false;
  console.log('[TTS][bg] stop', msg.tabId);
}

function handlePause(msg: TtsPause) {
  const q = tabIdToQueue.get(msg.tabId);
  if (q) q.paused = true;
  console.log('[TTS][bg] pause', msg.tabId);
}

function handleResume(msg: TtsResume) {
  const q = tabIdToQueue.get(msg.tabId);
  if (q) q.paused = false;
  console.log('[TTS][bg] resume', msg.tabId);
}

chrome.runtime.onMessage.addListener((message: Messages, sender) => {
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
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao buscar PDF: ${res.status}`);
    const buffer = await res.arrayBuffer();
    chrome.tabs.sendMessage(tabId, {
      type: 'PDF_DATA',
      buffer,
      voiceName: msg.voiceName,
      rate: msg.rate,
      pitch: msg.pitch
    } as PdfData);
  } catch (e) {
    if (sender.tab?.id) chrome.tabs.sendMessage(sender.tab.id, { type: 'TTS_ERROR', message: String(e) });
  }
}


