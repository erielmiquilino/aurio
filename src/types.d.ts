declare module '*?worker&url' {
  const url: string;
  export default url;
}

interface Window {
  requestSpeak?: (voiceName?: string, rate?: string, pitch?: string) => void;
  prepareSpeak?: (voiceName?: string, rate?: string, pitch?: string, mapOnly?: boolean) => void;
  readPdf?: (voiceName?: string, rate?: string, pitch?: string) => void;
  pauseSpeak?: () => void;
  resumeSpeak?: () => void;
  stopSpeak?: () => void;
}


