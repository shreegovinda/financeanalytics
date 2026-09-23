'use client';

import React, { useMemo } from 'react';

export interface CountryInfo {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  formatPlaceholder: string;
}

export const COUNTRIES: CountryInfo[] = [
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', formatPlaceholder: '98765 43210' },
  {
    code: 'US',
    name: 'United States',
    dialCode: '+1',
    flag: '🇺🇸',
    formatPlaceholder: '202 555 0123',
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    dialCode: '+44',
    flag: '🇬🇧',
    formatPlaceholder: '7911 123456',
  },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    dialCode: '+971',
    flag: '🇦🇪',
    formatPlaceholder: '50 123 4567',
  },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', formatPlaceholder: '416 555 0199' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', formatPlaceholder: '412 345 678' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬', formatPlaceholder: '8123 4567' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', formatPlaceholder: '151 23456789' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', formatPlaceholder: '6 12 34 56 78' },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    dialCode: '+966',
    flag: '🇸🇦',
    formatPlaceholder: '50 123 4567',
  },
  { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦', formatPlaceholder: '3312 3456' },
  { code: 'KW', name: 'Kuwait', dialCode: '+965', flag: '🇰🇼', formatPlaceholder: '9123 4567' },
  { code: 'OM', name: 'Oman', dialCode: '+968', flag: '🇴🇲', formatPlaceholder: '9123 4567' },
  { code: 'BH', name: 'Bahrain', dialCode: '+973', flag: '🇧🇭', formatPlaceholder: '3612 3456' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾', formatPlaceholder: '12 345 6789' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵', formatPlaceholder: '90 1234 5678' },
  {
    code: 'NZ',
    name: 'New Zealand',
    dialCode: '+64',
    flag: '🇳🇿',
    formatPlaceholder: '21 123 4567',
  },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪', formatPlaceholder: '83 123 4567' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱', formatPlaceholder: '6 12345678' },
  {
    code: 'CH',
    name: 'Switzerland',
    dialCode: '+41',
    flag: '🇨🇭',
    formatPlaceholder: '78 123 45 67',
  },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪', formatPlaceholder: '70 123 45 67' },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸', formatPlaceholder: '612 34 56 78' },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹', formatPlaceholder: '312 345 6789' },
  {
    code: 'ZA',
    name: 'South Africa',
    dialCode: '+27',
    flag: '🇿🇦',
    formatPlaceholder: '71 123 4567',
  },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬', formatPlaceholder: '802 123 4567' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪', formatPlaceholder: '712 345678' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷', formatPlaceholder: '11 91234 5678' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽', formatPlaceholder: '55 1234 5678' },
  {
    code: 'PH',
    name: 'Philippines',
    dialCode: '+63',
    flag: '🇵🇭',
    formatPlaceholder: '917 123 4567',
  },
  {
    code: 'ID',
    name: 'Indonesia',
    dialCode: '+62',
    flag: '🇮🇩',
    formatPlaceholder: '812 3456 7890',
  },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰', formatPlaceholder: '301 2345678' },
  {
    code: 'BD',
    name: 'Bangladesh',
    dialCode: '+880',
    flag: '🇧🇩',
    formatPlaceholder: '1712 345678',
  },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰', formatPlaceholder: '71 234 5678' },
  { code: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵', formatPlaceholder: '984 1234567' },
];

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  required?: boolean;
  variant?: 'light' | 'dark';
}

export function parsePhoneNumber(val: string): { country: CountryInfo; nationalNumber: string } {
  const cleaned = (val || '').trim();
  if (!cleaned) {
    return { country: COUNTRIES[0], nationalNumber: '' };
  }

  // Sort dial codes descending by length so longer codes (e.g. +971, +880) match before (+9)
  const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

  for (const c of sorted) {
    if (cleaned.startsWith(c.dialCode)) {
      const rest = cleaned.slice(c.dialCode.length).replace(/\D/g, '');
      return { country: c, nationalNumber: rest };
    }
  }

  // If number does not start with +, extract only digits
  const rawDigits = cleaned.replace(/\D/g, '');
  return { country: COUNTRIES[0], nationalNumber: rawDigits };
}

export default function PhoneInput({
  value,
  onChange,
  disabled = false,
  id,
  name,
  className = '',
  required = false,
  variant = 'light',
}: PhoneInputProps) {
  const { country, nationalNumber } = useMemo(() => parsePhoneNumber(value), [value]);

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCode = e.target.value;
    const found = COUNTRIES.find((c) => c.code === selectedCode) || COUNTRIES[0];
    const newFull = nationalNumber ? `${found.dialCode}${nationalNumber}` : found.dialCode;
    onChange(newFull);
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputVal = e.target.value;

    // If user pasted a full number with + dialcode, parse it
    if (inputVal.includes('+')) {
      const parsed = parsePhoneNumber(inputVal);
      onChange(parsed.nationalNumber ? `${parsed.country.dialCode}${parsed.nationalNumber}` : '');
      return;
    }

    // Strip non-digits and leading zeros
    const digits = inputVal.replace(/\D/g, '');
    const newFull = digits ? `${country.dialCode}${digits}` : '';
    onChange(newFull);
  };

  const isDark = variant === 'dark';

  return (
    <div
      className={`relative flex items-center rounded-xl border transition ${
        isDark
          ? 'border-white/20 bg-white/10 text-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-400/20'
          : 'border-gray-300 bg-white text-gray-900 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100'
      } ${className} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      {/* Country dropdown with flag and dial code */}
      <div
        className={`relative flex items-center border-r rounded-l-xl pl-3 pr-2 py-2 shrink-0 ${
          isDark ? 'border-white/15 bg-white/10' : 'border-gray-200 bg-gray-50/80'
        }`}
      >
        <span className="text-base mr-1.5 select-none">{country.flag}</span>
        <span
          className={`text-xs font-semibold select-none mr-1 ${
            isDark ? 'text-white' : 'text-gray-700'
          }`}
        >
          {country.dialCode}
        </span>
        <svg
          className={`w-3.5 h-3.5 pointer-events-none ${isDark ? 'text-gray-300' : 'text-gray-400'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
        <select
          value={country.code}
          onChange={handleCountryChange}
          disabled={disabled}
          title="Select Country Calling Code"
          aria-label="Country Calling Code"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} className="text-gray-900 bg-white">
              {c.flag} {c.name} ({c.dialCode})
            </option>
          ))}
        </select>
      </div>

      {/* National digits input */}
      <input
        type="tel"
        id={id}
        name={name}
        value={nationalNumber}
        onChange={handleNumberChange}
        disabled={disabled}
        required={required}
        placeholder={country.formatPlaceholder}
        className={`w-full bg-transparent px-3 py-2.5 text-sm focus:outline-none ${
          isDark
            ? 'text-white placeholder:text-gray-400'
            : 'text-gray-900 placeholder:text-gray-400'
        }`}
      />
    </div>
  );
}
