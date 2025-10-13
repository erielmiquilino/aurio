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
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [sessionChars, setSessionChars] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [useReadability, setUseReadability] = useState(true);
  const [isPdfTab, setIsPdfTab] = useState(false);

  useEffect(() => {
    setLoading(true);
    // Pedir contador de sessão ao background
    chrome.runtime.sendMessage({ type: 'GET_SESSION_CHARS' }, (response) => {
      if (response?.sessionChars != null) setSessionChars(response.sessionChars);
    });
    chrome.runtime.sendMessage({ type: 'GET_VOICES' });
    chrome.storage.local.get(['defaultVoice', 'defaultRate', 'defaultPitch', 'useReadability'], (res) => {
      if (res.defaultVoice) setVoice(res.defaultVoice);
      if (res.defaultRate) setRate(res.defaultRate);
      if (res.defaultPitch) setPitch(res.defaultPitch);
      if (res.useReadability != null) setUseReadability(res.useReadability);
    });
    // Verificar se a aba atual é PDF
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url?.toLowerCase().endsWith('.pdf')) {
        setIsPdfTab(true);
      }
    });
    const listener = (message: any) => {
      if (message.type === 'VOICES_LIST') {
        setVoices(message.voices);
        setLoading(false);
      }
      if (message.type === 'VOICES_ERROR') {
        console.error('[TTS][popup] VOICES_ERROR', message.message);
        setLoading(false);
      }
      if (message.type === 'TTS_PROGRESS') {
        const { paragraphIndex, totalParagraphs } = message;
        setProgress({ current: paragraphIndex, total: totalParagraphs });
        console.log('[TTS][popup] progresso atualizado', { current: paragraphIndex, total: totalParagraphs });
      }
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
        await chrome.tabs.sendMessage(tab.id!, { type: 'CONTENT_SPEAK', voiceName: voice, rate, pitch, useReadability });
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
    <div style={{ minWidth: 320, padding: 12 }}>
      <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="material-icons">volume_up</span>
        Aurio TTS
      </h3>
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div className="spinner"></div>
          <span style={{ fontSize: '0.9em' }}>Carregando vozes...</span>
        </div>
      )}
      <label>
        Voz
        <select value={voice} onChange={e => setVoice(e.target.value)} style={{ width: '100%' }} disabled={loading}>
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
      <div style={{ marginTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={useReadability} 
            onChange={e => {
              const val = e.target.checked;
              setUseReadability(val);
              chrome.storage.local.set({ useReadability: val });
            }} 
          />
          <span>Usar extração inteligente (Readability)</span>
        </label>
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
        <button onClick={play} disabled={loading}>
          <span className="material-icons" style={{ fontSize: 16, marginRight: 4 }}>play_arrow</span>
          Ler
        </button>
        <button onClick={pause}>
          <span className="material-icons" style={{ fontSize: 16, marginRight: 4 }}>pause</span>
          Pausar
        </button>
        <button onClick={resume}>
          <span className="material-icons" style={{ fontSize: 16, marginRight: 4 }}>play_circle</span>
          Retomar
        </button>
        <button onClick={stop}>
          <span className="material-icons" style={{ fontSize: 16, marginRight: 4 }}>stop</span>
          Parar
        </button>
        {isPdfTab && (
          <button onClick={readPdf}>
            <span className="material-icons" style={{ fontSize: 16, marginRight: 4 }}>picture_as_pdf</span>
            Ler PDF
          </button>
        )}
      </div>
      {progress && (
        <div style={{ marginTop: 12 }}>
          <progress value={progress.current} max={progress.total} style={{ width: '100%' }} />
          <p style={{ marginTop: 4, fontSize: '0.9em', color: '#666' }}>
            Parágrafo {progress.current} de {progress.total}
          </p>
        </div>
      )}
      {sessionChars > 0 && (
        <p style={{ marginTop: 8, fontSize: '0.9em', color: '#888' }}>
          Sessão atual: {sessionChars.toLocaleString()} caracteres
        </p>
      )}
      <p style={{ marginTop: 8, color: '#666' }}>Lê a seleção ou toda a página.</p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Popup />);


