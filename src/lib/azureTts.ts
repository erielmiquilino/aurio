export type AzureCredentials = {
  region: string;
  key: string;
};

export type VoiceInfo = {
  ShortName: string;
  Locale: string;
  LocaleName?: string;
  Gender?: string;
};

export async function listVoices(credentials: AzureCredentials): Promise<VoiceInfo[]> {
  const url = `https://${credentials.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Ocp-Apim-Subscription-Key': credentials.key,
      'User-Agent': 'Aurio-TTS/0.1'
    }
  });
  if (!res.ok) throw new Error(`Voices list failed: ${res.status}`);
  return res.json();
}

export function buildSsml(text: string, voiceName: string, rate: string, pitch: string): string {
  const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Adicionar marcadores temporários para pausas (serão substituídos após escape)
  let processedText = text;
  // Adicionar pausa média (300ms) após ponto final, exclamação, interrogação
  processedText = processedText.replace(/([.!?])\s+/g, '$1__BREAK_MEDIUM__ ');
  // Adicionar pausa curta (200ms) após vírgula, ponto e vírgula, dois pontos
  processedText = processedText.replace(/([,;:])\s+/g, '$1__BREAK_SHORT__ ');
  
  // Escapar o texto
  const safeText = escape(processedText)
    // Substituir marcadores por tags SSML reais
    .replace(/__BREAK_MEDIUM__/g, '<break time="300ms"/>')
    .replace(/__BREAK_SHORT__/g, '<break time="200ms"/>');
  
  const localeMatch = voiceName.match(/^[a-z]{2}-[A-Z]{2}/);
  const locale = localeMatch ? localeMatch[0] : 'en-US';
  const normalizedPitch = (() => {
    if (!pitch || pitch.trim().length === 0) return '+0Hz';
    const p = pitch.trim();
    if (/[-+]?\d+%$/.test(p)) return '+0Hz'; // percent não suportado em pitch → usar 0Hz
    if (/[-+]?\d+(\.\d+)?(Hz|hz|st)$/.test(p)) return p; // formatos suportados
    return '+0Hz';
  })();
  const normalizedRate = (() => {
    if (!rate || rate.trim().length === 0) return '0%';
    const r = rate.trim();
    if (/[-+]?\d+%$/.test(r)) return r;
    return '0%';
  })();
  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xml:lang="${locale}" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="${voiceName}">
    <prosody rate="${normalizedRate}" pitch="${normalizedPitch}">${safeText}</prosody>
  </voice>
</speak>`;
}

export async function synthesize(
  credentials: AzureCredentials,
  ssml: string,
  outputFormat = 'audio-24khz-96kbitrate-mono-mp3'
): Promise<{ data: ArrayBuffer; contentType: string | null }> {
  const url = `https://${credentials.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': credentials.key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': outputFormat,
      'User-Agent': 'Aurio-TTS/0.1'
    },
    body: ssml
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (_) { /* ignore */ }
    throw new Error(`TTS failed: ${res.status} ${detail?.slice(0, 300)}`);
  }
  const contentType = res.headers.get('Content-Type');
  if (contentType && !contentType.toLowerCase().startsWith('audio')) {
    const text = await res.text();
    throw new Error(`Unexpected content-type: ${contentType}. Body: ${text.slice(0, 300)}`);
  }
  const buf = await res.arrayBuffer();
  return { data: buf, contentType };
}


