import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function Options() {
  const [region, setRegion] = useState('brazilsouth');
  const [key, setKey] = useState('');
  const [voice, setVoice] = useState('pt-BR-FranciscaNeural');
  const [rate, setRate] = useState('0%');
  const [pitch, setPitch] = useState('+0Hz');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(['azureRegion', 'azureKey', 'defaultVoice', 'defaultRate', 'defaultPitch'], (res) => {
      if (res.azureRegion) setRegion(res.azureRegion);
      if (res.azureKey) setKey(res.azureKey);
      if (res.defaultVoice) setVoice(res.defaultVoice);
      if (res.defaultRate) setRate(res.defaultRate);
      if (res.defaultPitch) setPitch(res.defaultPitch);
    });
  }, []);

  function save() {
    chrome.storage.local.set({
      azureRegion: region,
      azureKey: key,
      defaultVoice: voice,
      defaultRate: rate,
      defaultPitch: pitch
    }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div style={{ maxWidth: 520, margin: '24px auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginTop: 0 }}>Configurações do Azure AI Speech</h2>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Região
        <input value={region} onChange={e => setRegion(e.target.value)} placeholder="brazilsouth" style={{ width: '100%' }} />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Chave de Assinatura
        <input value={key} onChange={e => setKey(e.target.value)} placeholder="***" style={{ width: '100%' }} />
      </label>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Voz padrão
        <input value={voice} onChange={e => setVoice(e.target.value)} placeholder="pt-BR-FranciscaNeural" style={{ width: '100%' }} />
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ flex: 1 }}>
          Velocidade padrão
          <input value={rate} onChange={e => setRate(e.target.value)} placeholder="0%" style={{ width: '100%' }} />
        </label>
        <label style={{ flex: 1 }}>
          Tom padrão (pitch)
          <input value={pitch} onChange={e => setPitch(e.target.value)} placeholder="+0Hz" style={{ width: '100%' }} />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={save}>Salvar</button>
        {saved && <span style={{ marginLeft: 8, color: 'green' }}>Salvo!</span>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Options />);


