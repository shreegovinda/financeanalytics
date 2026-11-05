'use client';

import type { SpeechLanguage } from '@/lib/voice';

interface Props {
  value: string;
  onChange: (code: string) => void;
  options: SpeechLanguage[];
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
}

export default function SpeechLanguageSelect({
  value,
  onChange,
  options,
  disabled,
  className = 'flex flex-wrap items-center gap-3 text-sm',
  selectClassName,
}: Props) {
  return (
    <label className={className}>
      Speech language
      <select
        aria-label="Speech language"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={selectClassName}
      >
        {options.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label} — {item.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
