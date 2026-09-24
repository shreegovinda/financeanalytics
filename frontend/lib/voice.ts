export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: {
          length: number;
          [index: number]: { isFinal: boolean; [index: number]: { transcript: string } };
        };
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function recognitionConstructor(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') return;
  const browser = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return browser.SpeechRecognition || browser.webkitSpeechRecognition;
}

export function recognitionError(code: string): string {
  const messages: Record<string, string> = {
    'not-allowed':
      'Microphone permission was denied. Allow microphone access in your browser settings, then try again.',
    'service-not-allowed':
      'Speech recognition is unavailable in this browser. Type your question below.',
    'audio-capture':
      'No microphone is available. Check your microphone connection and permissions.',
    network: 'Speech recognition could not connect. Check your connection or type your question.',
    'no-speech': 'No speech was detected. Tap Speak and try again.',
    'language-not-supported':
      'This speech language is unavailable. Choose another language or type your question.',
  };
  return messages[code] || 'Speech recognition stopped. Tap Speak to retry or type your question.';
}

// Keep numbers intact (including decimal amounts), remove Markdown, and avoid long utterances.
export function spokenChunks(text: string): string[] {
  const clean = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (
    clean
      .match(/.{1,220}(?:\s|$)|\S{1,220}/g)
      ?.map((chunk) => chunk.trim())
      .filter(Boolean) || []
  );
}

export class VoicePlayback {
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private utterance: SpeechSynthesisUtterance | null = null;

  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.utterance = null;
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
  }

  // Called synchronously from the user's Start/Speak/Ask click.
  unlock() {
    if (!window.speechSynthesis) return;
    const silence = new SpeechSynthesisUtterance(' ');
    silence.volume = 0;
    window.speechSynthesis.speak(silence);
    window.speechSynthesis.resume();
  }

  speak(text: string, language: string, onEnd: () => void, onError: () => void) {
    this.stop();
    if (!window.speechSynthesis) {
      onError();
      return;
    }
    const generation = this.generation;
    const chunks = spokenChunks(text);
    const next = () => {
      if (generation !== this.generation) return;
      const chunk = chunks.shift();
      if (!chunk) {
        onEnd();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunk);
      this.utterance = utterance;
      utterance.lang = language;
      const voices = window.speechSynthesis.getVoices();
      utterance.voice =
        voices.find((v) => v.lang === language && v.localService) ||
        voices.find((v) => v.lang === language) ||
        null;
      const fail = () => {
        if (generation !== this.generation) return;
        this.stop();
        onError();
      };
      utterance.onstart = () => {
        if (generation !== this.generation) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(fail, 60000);
      };
      utterance.onend = () => {
        if (generation !== this.generation) return;
        clearTimeout(this.timer);
        next();
      };
      utterance.onerror = fail;
      this.timer = setTimeout(fail, 6000);
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        fail();
      }
    };
    next();
  }
}
