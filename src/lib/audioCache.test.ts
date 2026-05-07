import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clear, get, getSize, set, type AudioCacheKey } from './audioCache';

const baseKey: AudioCacheKey = {
  text: 'Texto para cache',
  voiceName: 'pt-BR-FranciscaNeural',
  rate: '0%',
  pitch: '0%',
  outputFormat: 'audio-24khz-96kbitrate-mono-mp3'
};

function arrayBuffer(bytes: number[]): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function toBytes(buffer: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buffer));
}

describe('audioCache', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await clear();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await clear();
    vi.restoreAllMocks();
  });

  it('retorna null quando a chave nao existe', async () => {
    await expect(get(baseKey)).resolves.toBeNull();
  });

  it('salva e recupera o ArrayBuffer associado a chave', async () => {
    await set(baseKey, arrayBuffer([1, 2, 3, 4]));

    const cached = await get(baseKey);

    expect(cached).not.toBeNull();
    expect(toBytes(cached!)).toEqual([1, 2, 3, 4]);
  });

  it('diferencia voiceName, rate, pitch e outputFormat na chave', async () => {
    await set(baseKey, arrayBuffer([9]));

    const variants: AudioCacheKey[] = [
      { ...baseKey, voiceName: 'pt-BR-AntonioNeural' },
      { ...baseKey, rate: '+10%' },
      { ...baseKey, pitch: '+5%' },
      { ...baseKey, outputFormat: 'riff-24khz-16bit-mono-pcm' }
    ];

    for (const variant of variants) {
      await expect(get(variant)).resolves.toBeNull();
    }

    await expect(get(baseKey)).resolves.not.toBeNull();
  });

  it('clear remove dados salvos', async () => {
    await set(baseKey, arrayBuffer([5, 6, 7]));

    await clear();

    await expect(get(baseKey)).resolves.toBeNull();
    await expect(getSize()).resolves.toBe(0);
  });

  it('getSize soma os bytes dos audios salvos', async () => {
    await set(baseKey, arrayBuffer([1, 2]));
    await set({ ...baseKey, text: 'Outro texto' }, arrayBuffer([3, 4, 5]));

    await expect(getSize()).resolves.toBe(5);
  });

  it('expira entradas antigas e retorna null', async () => {
    const savedAt = new Date('2026-05-01T12:00:00.000Z');
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(savedAt.getTime());

    await set(baseKey, arrayBuffer([8, 9]));

    nowSpy.mockReturnValue(savedAt.getTime() + 8 * 24 * 60 * 60 * 1000);

    await expect(get(baseKey)).resolves.toBeNull();
    await expect(getSize()).resolves.toBe(0);
  });
});
