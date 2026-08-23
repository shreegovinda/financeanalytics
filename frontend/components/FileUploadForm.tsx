'use client';

import { useState } from 'react';
import { apiFetch, getErrorMessage } from '@/lib/api';
import { getAiProviderHeaders } from '@/lib/aiProvider';

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setFile(files[0]);
      setError('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError('');
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
          Select the bank, month, and file type before uploading. AI reads the statement and shows
          you everything it found — nothing is imported until you confirm.
          <span className="mt-1 block text-xs text-blue-700">
            XLSX generally extracts more accurately than PDF, if your bank offers it.
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Bank</span>
            <select
              value={bank}
              onChange={(event) => setBank(event.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              required
            >
              <option value="">Select bank</option>
              <option value="ICICI">ICICI</option>
              <option value="SBI">SBI</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Statement Month</span>
            <input
              type="month"
              value={statementMonth}
              onChange={(event) => setStatementMonth(event.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
              required
            />
          </label>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-gray-700">File Type</legend>
            <div className="grid grid-cols-2 gap-2">
              {['PDF', 'XLSX'].map((format) => (
                <label
                  key={format}
                  className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium ${
                    fileFormat === format
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="fileFormat"
                    value={format}
                    checked={fileFormat === format}
                    onChange={(event) => setFileFormat(event.target.value)}
                    disabled={loading}
                    className="sr-only"
                    required
                  />
                  {format}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

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
            accept={fileFormat === 'PDF' ? '.pdf' : fileFormat === 'XLSX' ? '.xlsx' : '.pdf,.xlsx'}
            disabled={loading}
            className="hidden"
            id="file-input"
          />
          <label htmlFor="file-input" className="cursor-pointer">
            <div className="space-y-2">
              <div className="text-4xl">📄</div>
              <p className="text-sm font-medium text-gray-700">Drag and drop your statement here</p>
              <p className="text-xs text-gray-500">or click to select a file</p>
              <p className="text-xs text-gray-400">PDF or XLSX • Max 10MB</p>
            </div>
          </label>
        </div>

        {file && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700">Selected file:</p>
            <p className="text-sm text-gray-600">{file.name}</p>
            <p className="text-xs text-gray-500 mt-2">
              Size: {(file.size / 1024 / 1024).toFixed(2)}MB • Type: {file.type || 'unknown'}
            </p>
          </div>
        )}

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
