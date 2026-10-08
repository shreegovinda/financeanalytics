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

export interface SynthesisVoice {
  lang: string;
  name?: string;
  localService?: boolean;
}

export type SpeechSupportLevel = 'expected' | 'limited';

export interface SpeechLanguage {
  code: string;
  label: string;
  nativeLabel: string;
  stt: SpeechSupportLevel;
  tts: SpeechSupportLevel;
  recognitionLangs: string[];
}

export const SPEECH_LANGUAGE_STORAGE_KEY = 'finlytix-speech-language';

// Browser Web Speech (Chrome/Edge via Google) is the existing STT/TTS provider.
// "expected" = commonly offered by Chromium + Google speech; "limited" = often
// missing on desktop voices or rejected with language-not-supported.
export const SPEECH_LANGUAGES: SpeechLanguage[] = [
  {
    code: 'en-IN',
    label: 'English (India)',
    nativeLabel: 'English',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['en-IN', 'en-US'],
  },
  {
    code: 'hi-IN',
    label: 'Hindi',
    nativeLabel: 'हिन्दी',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['hi-IN', 'hi'],
  },
  {
    code: 'bn-IN',
    label: 'Bengali',
    nativeLabel: 'বাংলা',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['bn-IN', 'bn-BD', 'bn'],
  },
  {
    code: 'te-IN',
    label: 'Telugu',
    nativeLabel: 'తెలుగు',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['te-IN', 'te'],
  },
  {
    code: 'mr-IN',
    label: 'Marathi',
    nativeLabel: 'मराठी',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['mr-IN', 'mr'],
  },
  {
    code: 'ta-IN',
    label: 'Tamil',
    nativeLabel: 'தமிழ்',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['ta-IN', 'ta'],
  },
  {
    code: 'gu-IN',
    label: 'Gujarati',
    nativeLabel: 'ગુજરાતી',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['gu-IN', 'gu'],
  },
  {
    code: 'kn-IN',
    label: 'Kannada',
    nativeLabel: 'ಕನ್ನಡ',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['kn-IN', 'kn'],
  },
  {
    code: 'ml-IN',
    label: 'Malayalam',
    nativeLabel: 'മലയാളം',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['ml-IN', 'ml'],
  },
  {
    code: 'pa-IN',
    label: 'Punjabi',
    nativeLabel: 'ਪੰਜਾਬੀ',
    stt: 'expected',
    tts: 'limited',
    recognitionLangs: ['pa-IN', 'pa-Guru-IN', 'pa'],
  },
  {
    code: 'or-IN',
    label: 'Odia',
    nativeLabel: 'ଓଡ଼ିଆ',
    stt: 'limited',
    tts: 'limited',
    recognitionLangs: ['or-IN', 'or'],
  },
  {
    code: 'ur-IN',
    label: 'Urdu',
    nativeLabel: 'اردو',
    stt: 'expected',
    tts: 'limited',
    recognitionLangs: ['ur-IN', 'ur-PK', 'ur'],
  },
  {
    code: 'as-IN',
    label: 'Assamese',
    nativeLabel: 'অসমীয়া',
    stt: 'limited',
    tts: 'limited',
    recognitionLangs: ['as-IN', 'as'],
  },
];

export const EXTRA_SPEECH_LANGUAGES: SpeechLanguage[] = [
  {
    code: 'en-US',
    label: 'English (US)',
    nativeLabel: 'English',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['en-US', 'en-IN'],
  },
  {
    code: 'es-ES',
    label: 'Spanish',
    nativeLabel: 'Español',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['es-ES', 'es'],
  },
  {
    code: 'fr-FR',
    label: 'French',
    nativeLabel: 'Français',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['fr-FR', 'fr'],
  },
  {
    code: 'de-DE',
    label: 'German',
    nativeLabel: 'Deutsch',
    stt: 'expected',
    tts: 'expected',
    recognitionLangs: ['de-DE', 'de'],
  },
];

export function speechLanguageByCode(code: string | undefined): SpeechLanguage | undefined {
  if (!code) return;
  return (
    SPEECH_LANGUAGES.find((item) => item.code === code) ||
    EXTRA_SPEECH_LANGUAGES.find((item) => item.code === code)
  );
}

export function languageSelectOptions(
  extra: Array<string | undefined> = [],
  indianOnly = false,
): SpeechLanguage[] {
  const catalog = indianOnly ? SPEECH_LANGUAGES : [...SPEECH_LANGUAGES, ...EXTRA_SPEECH_LANGUAGES];
  const seen = new Set<string>();
  const options: SpeechLanguage[] = [];
  for (const item of catalog) {
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    options.push(item);
  }
  for (const code of extra) {
    if (!code || seen.has(code)) continue;
    const known = speechLanguageByCode(code);
    if (known) {
      seen.add(known.code);
      options.push(known);
      continue;
    }
    seen.add(code);
    options.push({
      code,
      label: code,
      nativeLabel: code,
      stt: 'limited',
      tts: 'limited',
      recognitionLangs: [code],
    });
  }
  return options;
}

export function normalizeLang(tag: string): string {
  return tag.trim().replace(/_/g, '-').toLowerCase();
}

export function languageMatches(voiceLang: string, requested: string): boolean {
  const voice = normalizeLang(voiceLang);
  const want = normalizeLang(requested);
  if (!voice || !want) return false;
  if (voice === want) return true;
  const voiceBase = voice.split('-')[0];
  const wantBase = want.split('-')[0];
  return voice === wantBase || voiceBase === want || voiceBase === wantBase;
}

export function pickSynthesisVoice(
  language: string,
  voices: SynthesisVoice[],
): SynthesisVoice | null {
  const candidates = speechLanguageByCode(language)?.recognitionLangs || [language];
  for (const candidate of candidates) {
    const local = voices.find(
      (voice) => languageMatches(voice.lang, candidate) && voice.localService,
    );
    if (local) return local;
  }
  for (const candidate of candidates) {
    const remote = voices.find((voice) => languageMatches(voice.lang, candidate));
    if (remote) return remote;
  }
  return null;
}

export function synthesisGapMessage(
  language: string,
  voices: SynthesisVoice[],
): string | undefined {
  if (pickSynthesisVoice(language, voices)) return;
  const meta = speechLanguageByCode(language);
  const label = meta ? `${meta.label} (${meta.nativeLabel})` : language;
  return `No matching ${label} speaking voice was found on this device. Playback will use the browser default, which may sound wrong. Install a system voice for this language, or read the answer as text.`;
}

export function recognitionLangFor(language: string): string {
  return speechLanguageByCode(language)?.recognitionLangs[0] || language;
}

export function loadSpeechLanguage(fallback = 'en-IN'): string {
  if (typeof window === 'undefined') {
    return speechLanguageByCode(fallback)?.code || 'en-IN';
  }
  try {
    const saved = window.localStorage.getItem(SPEECH_LANGUAGE_STORAGE_KEY);
    if (saved && speechLanguageByCode(saved)) return saved;
  } catch {
    // Ignore blocked storage.
  }
  const fromFallback =
    speechLanguageByCode(fallback) ||
    SPEECH_LANGUAGES.find((item) =>
      normalizeLang(item.code).startsWith(normalizeLang(fallback).split('-')[0]),
    );
  return fromFallback?.code || 'en-IN';
}

export function saveSpeechLanguage(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SPEECH_LANGUAGE_STORAGE_KEY, code);
    window.dispatchEvent?.(new Event('finlytix-speech-language'));
  } catch {
    // Ignore blocked storage.
  }
}

export function subscribeSpeechLanguage(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('finlytix-speech-language', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('finlytix-speech-language', onChange);
    window.removeEventListener('storage', onChange);
  };
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
      'This speech language is unavailable in your browser. Choose another language or type your question.',
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
  private voicesListener: (() => void) | undefined;

  stop() {
    this.generation++;
    clearTimeout(this.timer);
    this.utterance = null;
    if (this.voicesListener && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.removeEventListener?.('voiceschanged', this.voicesListener);
      this.voicesListener = undefined;
    }
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

  speak(
    text: string,
    language: string,
    onEnd: () => void,
    onError: () => void,
    onGap?: (message: string) => void,
  ) {
    this.stop();
    if (!window.speechSynthesis) {
      onError();
      return;
    }
    const generation = this.generation;
    const chunks = spokenChunks(text);
    const begin = () => {
      if (generation !== this.generation) return;
      this.voicesListener = undefined;
      const voices = window.speechSynthesis.getVoices();
      const matched = pickSynthesisVoice(language, voices);
      if (voices.length) {
        const gap = synthesisGapMessage(language, voices);
        if (gap) onGap?.(gap);
      } else {
        onGap?.(
          'This browser did not provide a speaking voice list. Playback may use the wrong language; read the answer as text if it sounds wrong.',
        );
      }
      const next = () => {
        if (generation !== this.generation) return;
        const chunk = chunks.shift();
        if (!chunk) {
          onEnd();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(chunk);
        this.utterance = utterance;
        utterance.lang = recognitionLangFor(language);
        if (matched) {
          utterance.voice = matched as SpeechSynthesisVoice;
        }
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
    };
    if (window.speechSynthesis.getVoices().length) {
      begin();
      return;
    }
    const delayed = () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', delayed);
      if (this.voicesListener === delayed) this.voicesListener = undefined;
      begin();
    };
    this.voicesListener = delayed;
    window.speechSynthesis.addEventListener?.('voiceschanged', delayed);
    this.timer = setTimeout(delayed, 400);
  }
}
