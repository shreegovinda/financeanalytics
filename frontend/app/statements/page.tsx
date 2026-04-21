'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FileUploadForm from '@/components/FileUploadForm';
import axios from 'axios';

interface Statement {
  id: string;
  bank_name: string;
  file_name: string;
  uploaded_at: string;
  status: string;
}

export default function StatementsPage() {
  const router = useRouter();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetchStatements();
  }, [router]);

  const fetchStatements = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/upload`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setStatements(response.data);
      setError('');
    } catch (err) {
      setError('Failed to load statements');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = () => {
    fetchStatements();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Bank Statements</h1>
          <p className="text-gray-600">Upload and manage your bank statements</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Upload New Statement</h2>
          <FileUploadForm onUploadSuccess={handleUploadSuccess} />
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Your Statements</h2>
          </div>

          {loading ? (
            <div className="px-6 py-8 text-center text-gray-500">Loading...</div>
          ) : error ? (
            <div className="px-6 py-8 bg-red-50 text-red-700">{error}</div>
          ) : statements.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">No statements uploaded yet. Upload your first statement above!</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Bank</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">File Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {statements.map((statement) => (
                    <tr key={statement.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/statements/${statement.id}`)}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{statement.bank_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{statement.file_name}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            statement.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : statement.status === 'processing'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {statement.status.charAt(0).toUpperCase() + statement.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(statement.uploaded_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
