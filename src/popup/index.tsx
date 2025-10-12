import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

type Voice = { ShortName: string; Locale: string; LocaleName?: string };

function Popup() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState<string>('pt-BR-FranciscaNeural');
  const [rate, setRate] = useState<string>('0%');
  const [pitch, setPitch] = useState<string>('+0Hz');
  const [filterLocale, setFilterLocale] = useState<string>('');
  const [filterLocaleName, setFilterLocaleName] = useState<string>('');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_VOICES' });
    chrome.storage.local.get(['defaultVoice', 'defaultRate', 'defaultPitch'], (res) => {
      if (res.defaultVoice) setVoice(res.defaultVoice);
      if (res.defaultRate) setRate(res.defaultRate);
      if (res.defaultPitch) setPitch(res.defaultPitch);
    });
    const listener = (message: any) => {
      if (message.type === 'VOICES_LIST') setVoices(message.voices);
      if (message.type === 'VOICES_ERROR') console.error('[TTS][popup] VOICES_ERROR', message.message);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function withActiveTab<T>(fn: (tab: chrome.tabs.Tab) => Promise<T> | T) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    return fn(tab);
  }

  function play() {
    withActiveTab(async (tab) => {
      try {
        await chrome.tabs.sendMessage(tab.id!, { type: 'CONTENT_SPEAK', voiceName: voice, rate, pitch });
      } catch (err) {
        console.error('[TTS][popup] sendMessage CONTENT_SPEAK error', err);
      }
    });
  }

  function stop() {
    withActiveTab(async (tab) => {
      try {
        await chrome.tabs.sendMessage(tab.id!, { type: 'CONTENT_STOP' });
      } catch (err) {
        console.error('[TTS][popup] sendMessage CONTENT_STOP error', err);
      }
    });
  }

  function pause() {
    withActiveTab(async (tab) => {
      try {
        await chrome.tabs.sendMessage(tab.id!, { type: 'CONTENT_PAUSE' });
      } catch (err) {
        console.error('[TTS][popup] sendMessage CONTENT_PAUSE error', err);
      }
    });
  }

  function resume() {
    withActiveTab(async (tab) => {
      try {
        await chrome.tabs.sendMessage(tab.id!, { type: 'CONTENT_RESUME' });
      } catch (err) {
        console.error('[TTS][popup] sendMessage CONTENT_RESUME error', err);
      }
    });
  }

  function readPdf() {
    withActiveTab(async (tab) => {
      try {
        await chrome.tabs.sendMessage(tab.id!, { type: 'CONTENT_READ_PDF', voiceName: voice, rate, pitch });
      } catch (err) {
        console.error('[TTS][popup] sendMessage CONTENT_READ_PDF error', err);
      }
    });
  }

  const filteredVoices = voices.filter(v =>
    (!filterLocale || v.Locale?.toLowerCase().includes(filterLocale.toLowerCase())) &&
    (!filterLocaleName || (v.LocaleName || '').toLowerCase().includes(filterLocaleName.toLowerCase()))
  );

  return (
    <div style={{ minWidth: 320, padding: 12, fontFamily: 'sans-serif' }}>
      <h3 style={{ marginTop: 0 }}>Aurio TTS</h3>
      <label>
        Voz
        <select value={voice} onChange={e => setVoice(e.target.value)} style={{ width: '100%' }}>
          {filteredVoices.map(v => (
            <option key={v.ShortName} value={v.ShortName}>
              {v.ShortName} ({v.Locale}{v.LocaleName ? ` - ${v.LocaleName}` : ''})
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <input placeholder="Filtrar Locale (ex: pt-BR)" value={filterLocale} onChange={e => setFilterLocale(e.target.value)} style={{ flex: 1 }} />
        <input placeholder="Filtrar LocaleName (ex: Portuguese)" value={filterLocaleName} onChange={e => setFilterLocaleName(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <label style={{ flex: 1 }}>
          Velocidade
          <input value={rate} onChange={e => setRate(e.target.value)} placeholder="0%" />
        </label>
        <label style={{ flex: 1 }}>
          Tom
          <input value={pitch} onChange={e => setPitch(e.target.value)} placeholder="+0Hz" />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button onClick={play}>Ler</button>
        <button onClick={pause}>Pausar</button>
        <button onClick={resume}>Retomar</button>
        <button onClick={stop}>Parar</button>
        <button onClick={readPdf}>Ler PDF desta guia</button>
      </div>
      <p style={{ marginTop: 8, color: '#666' }}>Lê a seleção ou toda a página.</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);


