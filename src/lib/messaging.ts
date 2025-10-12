export type TtsRequest = {
  type: 'TTS_REQUEST';
  tabId: number;
  requestId: string;
  textBlocks: string[];
  voiceName: string;
  rate: string; // e.g., "+10%" or "-10%"
  pitch: string; // e.g., "+0Hz" or "+5%"
};

export type TtsStop = {
  type: 'TTS_STOP';
  tabId: number;
};

export type TtsPause = {
  type: 'TTS_PAUSE';
  tabId: number;
};

export type TtsResume = {
  type: 'TTS_RESUME';
  tabId: number;
};

export type TtsAudioChunk = {
  type: 'TTS_AUDIO_CHUNK';
  requestId: string;
  chunkIndex: number;
  totalChunks: number;
  audio: ArrayBuffer;
};

export type TtsProgress = {
  type: 'TTS_PROGRESS';
  requestId: string;
  paragraphIndex: number;
  totalParagraphs: number;
};

export type GetVoices = {
  type: 'GET_VOICES';
};

export type SetCredentials = {
  type: 'SET_CREDENTIALS';
  region: string;
  key: string;
};

export type ReadPdf = {
  type: 'READ_PDF';
  tabId?: number;
  voiceName: string;
  rate: string;
  pitch: string;
};

export type PdfData = {
  type: 'PDF_DATA';
  buffer: ArrayBuffer;
  voiceName: string;
  rate: string;
  pitch: string;
};

export type TtsError = {
  type: 'TTS_ERROR';
  message: string;
};

export type Messages =
  | TtsRequest
  | TtsStop
  | TtsPause
  | TtsResume
  | TtsAudioChunk
  | TtsProgress
  | GetVoices
  | SetCredentials
  | ReadPdf
  | PdfData
  | TtsError;


