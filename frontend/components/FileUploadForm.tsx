'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiGet, getErrorMessage } from '@/lib/api';
import { getAiProviderHeaders } from '@/lib/aiProvider';
import MonthPicker, { type TakenMonth } from '@/components/MonthPicker';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const FORMAT_EXTENSIONS: Record<string, string> = { PDF: '.pdf', XLSX: '.xlsx' };

const BANKS = [
  { id: 'ICICI', name: 'ICICI Bank', initials: 'IC', accent: 'from-orange-500 to-red-500' },
  {
    id: 'SBI',
    name: 'State Bank of India',
    initials: 'SBI',
    accent: 'from-blue-500 to-indigo-600',
  },
];

interface UploadResponse {
  success: boolean;
  requiresReview?: boolean;
  statementId: string;
  transactionCount: number;
  bankName?: string;
  message: string;
}

export default function FileUploadForm({
  onUploadSuccess,
}: {
  onUploadSuccess?: (statementId?: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [bank, setBank] = useState('');
  const [statementMonth, setStatementMonth] = useState('');
  const [fileFormat, setFileFormat] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingStatementId, setPendingStatementId] = useState<string | null>(null);
  const [takenByBank, setTakenByBank] = useState<Record<string, TakenMonth[]>>({});

  const loadTakenMonths = useCallback(async () => {
    try {
      const token = localStorage.getItem('token') ?? undefined;
      const data = await apiGet<{ banks: Record<string, TakenMonth[]> }>(
        `${API_BASE_URL}/api/upload/months`,
        token,
      );
      setTakenByBank(data.banks);
    } catch {
      // The picker still works without this; it just cannot pre-mark taken months.
      setTakenByBank({});
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadTakenMonths);
  }, [loadTakenMonths]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  /**
   * The input's `accept` attribute is only a filter in the file picker: it does
   * nothing for drag-and-drop, and browsers let users override it. So the
   * extension is checked here too, and again on the server.
   */
  const acceptFile = (candidate: File): void => {
    const expected = FORMAT_EXTENSIONS[fileFormat];

    if (!fileFormat) {
      setError('Choose a file type first, so we can check the file matches.');
      return;
    }

    if (!candidate.name.toLowerCase().endsWith(expected)) {
      setError(`You selected ${fileFormat}, but "${candidate.name}" is not a ${expected} file.`);
      setFile(null);
      return;
    }

    setFile(candidate);
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      acceptFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      acceptFile(e.target.files[0]);
    }
  };

  const validateFile = (): string | null => {
    if (!bank) return 'Please select a bank before uploading';
    if (!statementMonth) return 'Please select the statement month before uploading';
    if (!fileFormat) return 'Please select PDF or XLSX before uploading';
    if (!file) return 'Please select a file';

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 10MB`;
    }

    const fileName = file.name.toLowerCase();
    const actualFormat = fileName.endsWith('.pdf')
      ? 'PDF'
      : fileName.endsWith('.xlsx')
        ? 'XLSX'
        : '';
    if (!actualFormat) {
      return 'Invalid file type. Please upload a PDF or XLSX file';
    }

    if (actualFormat !== fileFormat) {
      return `Selected format is ${fileFormat}, but the file is ${actualFormat}`;
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validateFile();
    if (validationError) {
      setError(validationError);
      return;
    }

    const selectedFile = file;
    if (!selectedFile) {
      setError('Please select a file');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('bank', bank);
      formData.append('statementMonth', statementMonth);
      formData.append('fileFormat', fileFormat);
      formData.append('file', selectedFile);

      const token = localStorage.getItem('token');
      const response = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/upload`,
        {
          method: 'POST',
          timeout: 120000,
          retries: 0,
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
            ...getAiProviderHeaders(),
          },
          body: formData,
        },
      );

      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/auth';
        }
        throw new Error('Session expired. Redirecting to login...');
      }

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as {
          error?: string;
          pendingStatementId?: string;
        };
        if (errBody.pendingStatementId) {
          setPendingStatementId(errBody.pendingStatementId);
        }
        throw new Error(errBody.error || `Upload failed (${response.status})`);
      }

      const data = (await response.json()) as UploadResponse;

      setSuccess(data.message);
      setFile(null);

      // The month just used is now taken; keep the picker honest.
      void loadTakenMonths();

      if (onUploadSuccess) {
        onUploadSuccess(data.requiresReview ? data.statementId : undefined);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Nothing is imported until you review it. We read the statement and show you everything we
          found first.
        </div>

        <Step n={1} title="Which bank?">
          <div className="grid gap-3 sm:grid-cols-2">
            {BANKS.map((option) => {
              const selected = bank === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setBank(option.id);
                    // Taken months differ per bank, so a stale choice could now
                    // point at a month that is already imported.
                    setStatementMonth('');
                  }}
                  className={`flex items-center gap-3 rounded-xl border-2 p-4 text-left transition ${
                    selected
                      ? 'border-blue-600 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/40'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${option.accent} text-sm font-bold text-white`}
                  >
                    {option.initials}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-900">{option.id}</span>
                    <span className="block truncate text-xs text-gray-500">{option.name}</span>
                  </span>
                  {selected && <span className="ml-auto text-lg text-blue-600">✓</span>}
                </button>
              );
            })}
          </div>
        </Step>

        <Step n={2} title="Which month?" muted={!bank}>
          {bank ? (
            <MonthPicker
              value={statementMonth}
              onChange={setStatementMonth}
              taken={takenByBank[bank] ?? []}
              disabled={loading}
            />
          ) : (
            <p className="text-sm text-gray-400">Choose a bank first.</p>
          )}
        </Step>

        <Step n={3} title="File type" muted={!statementMonth}>
          <div className="grid grid-cols-2 gap-3">
            {['PDF', 'XLSX'].map((format) => {
              const selected = fileFormat === format;
              return (
                <button
                  key={format}
                  type="button"
                  disabled={loading || !statementMonth}
                  onClick={() => {
                    setFileFormat(format);
                    // A file already chosen may not match the new format.
                    setFile(null);
                    setError('');
                  }}
                  className={`rounded-xl border-2 p-3 text-center transition ${
                    selected
                      ? 'border-blue-600 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <span className="block font-semibold text-gray-900">{format}</span>
                  <span className="block text-xs text-gray-500">
                    {format === 'XLSX' ? 'Reads more accurately' : 'Most common'}
                  </span>
                </button>
              );
            })}
          </div>
        </Step>

        <Step n={4} title="Upload the file" muted={!fileFormat}>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              onChange={handleFileChange}
              accept={
                fileFormat === 'PDF' ? '.pdf' : fileFormat === 'XLSX' ? '.xlsx' : '.pdf,.xlsx'
              }
              disabled={loading || !fileFormat}
              className="hidden"
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className={fileFormat ? 'cursor-pointer' : 'cursor-not-allowed'}
            >
              <div className="space-y-2">
                <div className="text-4xl">📄</div>
                <p className="text-sm font-medium text-gray-700">
                  {fileFormat
                    ? `Drop your ${fileFormat} statement here`
                    : 'Choose a file type above first'}
                </p>
                <p className="text-xs text-gray-500">or click to select a file</p>
                <p className="text-xs text-gray-400">
                  {fileFormat ? `${FORMAT_EXTENSIONS[fileFormat]} only` : 'PDF or XLSX'} • Max 10MB
                </p>
              </div>
            </label>
          </div>

          {file && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <span className="text-2xl">📄</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">
                  {file.name}
                </span>
                <span className="block text-xs text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-sm font-medium text-blue-700 hover:text-blue-900"
              >
                Remove
              </button>
            </div>
          )}
        </Step>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-600 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800">{error}</p>
                {pendingStatementId && (
                  <a
                    href={`/statements/${pendingStatementId}/preview`}
                    className="mt-2 inline-block text-sm font-semibold text-red-900 underline hover:text-red-700"
                  >
                    Review the pending statement →
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border-l-4 border-green-600 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">{success}</p>
              </div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !bank || !statementMonth || !fileFormat || !file}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Uploading...' : 'Upload Statement'}
        </button>
      </form>
    </div>
  );
}

function Step({
  n,
  title,
  muted = false,
  children,
}: {
  n: number;
  title: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={muted ? 'opacity-60 transition' : 'transition'}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}
