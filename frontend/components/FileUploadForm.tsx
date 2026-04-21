'use client';

import { useState } from 'react';
import { authAPI } from '@/lib/api';
import axios, { AxiosError } from 'axios';

interface UploadResponse {
  success: boolean;
  statementId: string;
  transactionCount: number;
  message: string;
}

interface APIError {
  response?: {
    data?: {
      error?: string;
    };
  };
}

export default function FileUploadForm({ onUploadSuccess }: { onUploadSuccess?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState('ICICI');
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!file) {
      setError('Please select a file');
      return;
    }

    if (!bankName) {
      setError('Please select a bank');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bankName', bankName);

      const token = localStorage.getItem('token');
      const response = await axios.post<UploadResponse>(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      setSuccess(response.data.message);
      setFile(null);
      setBankName('ICICI');

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: unknown) {
      const apiError = err as APIError | AxiosError;
      if (axios.isAxiosError(apiError)) {
        setError(apiError.response?.data?.error || 'Upload failed');
      } else {
        setError('Upload failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bank</label>
            <select
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="ICICI">ICICI Bank</option>
              <option value="HDFC">HDFC Bank</option>
              <option value="Axis">Axis Bank</option>
            </select>
          </div>
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
            accept=".pdf,.xlsx,.xls"
            disabled={loading}
            className="hidden"
            id="file-input"
          />
          <label htmlFor="file-input" className="cursor-pointer">
            <div className="space-y-2">
              <div className="text-4xl">📄</div>
              <p className="text-sm font-medium text-gray-700">Drag and drop your statement here</p>
              <p className="text-xs text-gray-500">or click to select a file</p>
              <p className="text-xs text-gray-400">PDF or Excel (XLSX/XLS) • Max 10MB</p>
            </div>
          </label>
        </div>

        {file && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700">Selected file:</p>
            <p className="text-sm text-gray-600">{file.name}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-800">{success}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !file}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
        >
          {loading ? 'Uploading...' : 'Upload Statement'}
        </button>
      </form>
    </div>
  );
}
