'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface APIError {
  response?: {
    status?: number;
    data?: {
      error?: string;
      reason?: string;
    };
  };
}

type Status = 'verifying' | 'success' | 'already' | 'error';

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');
  // Guards against React Strict Mode running the effect twice in development,
  // which would spend the single-use token on the first pass and report the
  // second as invalid.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const token = searchParams.get('token');

    const verify = async () => {
      if (!token) {
        setStatus('error');
        setMessage('This link is missing its verification token.');
        return;
      }

      try {
        // Posted rather than sent as a GET query so the token stays out of
        // Referer headers, browser history, and server access logs.
        const response = await axios.post(`${API_BASE_URL}/api/auth/verify-email/token`, {
          token,
        });

        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        setStatus('success');
        setMessage('Your email is verified. Taking you to your dashboard...');
        setTimeout(() => router.replace('/dashboard'), 1200);
      } catch (err: unknown) {
        const apiError = err as APIError;
        if (apiError.response?.data?.reason === 'already_verified') {
          setStatus('already');
          setMessage('This email is already verified. You can sign in.');
          return;
        }
        setStatus('error');
        setMessage(
          apiError.response?.data?.error ||
            'This verification link is invalid or has expired. Request a new one from the sign-in page.',
        );
      }
    };

    void verify();
  }, [router, searchParams]);

  const icon = {
    verifying: null,
    success: '✓',
    already: 'ℹ',
    error: '✕',
  }[status];

  const accent = {
    verifying: 'text-blue-200',
    success: 'text-emerald-300',
    already: 'text-blue-200',
    error: 'text-red-300',
  }[status];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 px-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 text-center">
        <div className="mb-6 flex justify-center">
          {status === 'verifying' ? (
            <div className="w-12 h-12 border-4 border-white/20 border-t-blue-400 rounded-full animate-spin" />
          ) : (
            <div
              className={`w-12 h-12 rounded-full border-2 border-current flex items-center justify-center text-2xl ${accent}`}
            >
              {icon}
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-white mb-3">
          {status === 'verifying' && 'Verifying your email'}
          {status === 'success' && 'Email verified'}
          {status === 'already' && 'Already verified'}
          {status === 'error' && 'Verification failed'}
        </h1>

        <p className="text-sm text-blue-100 mb-6">
          {message || 'Just a moment while we confirm your address.'}
        </p>

        {(status === 'error' || status === 'already') && (
          <button
            type="button"
            onClick={() => router.replace('/auth')}
            className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold py-3 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition"
          >
            Go to sign in
          </button>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
