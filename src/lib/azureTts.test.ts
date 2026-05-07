import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSsml, listVoices, synthesize, type AzureCredentials, type VoiceInfo } from './azureTts';

const credentials: AzureCredentials = {
  region: 'eastus',
  key: 'test-key'
};

describe('buildSsml', () => {
  it('escapes XML text and derives xml:lang from the voice name', () => {
    const ssml = buildSsml(
      'Use A&B < C > D',
      'pt-BR-FranciscaNeural',
      '+20%',
      '+3Hz'
    );

    expect(ssml).toContain('xml:lang="pt-BR"');
    expect(ssml).toContain('<voice name="pt-BR-FranciscaNeural">');
    expect(ssml).toContain('rate="+20%"');
    expect(ssml).toContain('pitch="+3Hz"');
    expect(ssml).toContain('Use A&amp;B &lt; C &gt; D');
  });

  it('inserts SSML breaks after punctuation', () => {
    const ssml = buildSsml(
      'Hello, world. Next? Fine! Wait: yes; done',
      'en-US-JennyNeural',
      '0%',
      '+0Hz'
    );

    expect(ssml).toContain('Hello,<break time="200ms"/> world.<break time="300ms"/>');
    expect(ssml).toContain('Next?<break time="300ms"/> Fine!<break time="300ms"/>');
    expect(ssml).toContain('Wait:<break time="200ms"/> yes;<break time="200ms"/> done');
  });

  it('falls back to en-US when the voice name does not start with a locale', () => {
    const ssml = buildSsml('Text', 'CustomVoice', '0%', '+0Hz');

    expect(ssml).toContain('xml:lang="en-US"');
  });

  it('normalizes blank and invalid rate or pitch values', () => {
    const blankValues = buildSsml('Text', 'en-US-JennyNeural', '   ', '   ');
    const invalidValues = buildSsml('Text', 'en-US-JennyNeural', 'loud', '+10%');

    expect(blankValues).toContain('rate="0%"');
    expect(blankValues).toContain('pitch="+0Hz"');
    expect(invalidValues).toContain('rate="0%"');
    expect(invalidValues).toContain('pitch="+0Hz"');
  });

  it('trims supported rate and pitch values', () => {
    const ssml = buildSsml('Text', 'en-US-JennyNeural', ' -15% ', ' +2st ');

    expect(ssml).toContain('rate="-15%"');
    expect(ssml).toContain('pitch="+2st"');
  });
});

describe('Azure TTS API helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('listVoices returns voices from Azure Speech', async () => {
    const voices: VoiceInfo[] = [
      { ShortName: 'en-US-JennyNeural', Locale: 'en-US', Gender: 'Female' }
    ];
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(voices), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(listVoices(credentials)).resolves.toEqual(voices);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://eastus.tts.speech.microsoft.com/cognitiveservices/voices/list',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Ocp-Apim-Subscription-Key': 'test-key',
          'User-Agent': 'Aurio-TTS/0.1'
        })
      })
    );
  });

  it('listVoices throws when Azure Speech rejects the request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    await expect(listVoices(credentials)).rejects.toThrow('Voices list failed: 401');
  });

  it('synthesize posts SSML and returns audio bytes', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' }
    }));

    const result = await synthesize(credentials, '<speak>hello</speak>');

    expect([...new Uint8Array(result.data)]).toEqual([1, 2, 3]);
    expect(result.contentType).toBe('audio/mpeg');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
          'Ocp-Apim-Subscription-Key': 'test-key'
        }),
        body: '<speak>hello</speak>'
      })
    );
  });

  it('synthesize includes Azure error detail when synthesis fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad ssml', { status: 400 }));

    await expect(synthesize(credentials, '<bad/>')).rejects.toThrow('TTS failed: 400 bad ssml');
  });

  it('synthesize rejects non-audio success responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"not audio"}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));

    await expect(synthesize(credentials, '<speak>hello</speak>'))
      .rejects
      .toThrow('Unexpected content-type: application/json');
  });
});
