'use client';
import { useState } from 'react';
import { apiPost, apiPut, getErrorMessage } from '@/lib/api';

interface ModalProps {
  onClose: () => void;
  onSuccess: (newValue: string) => void;
}

export function UpdateEmailModal({ onClose, onSuccess }: ModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [newEmail, setNewEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newEmail.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || undefined;
      await apiPost('/api/auth/request-email-update', { newEmail }, token);
      setStep(2);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || undefined;
      await apiPost('/api/auth/verify-email-update', { newEmail, otp }, token);
      onSuccess(newEmail);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Update Email Address</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={requestOTP}>
              <p className="text-sm text-slate-600 mb-4">
                Enter your new email address. We will send a verification code to confirm ownership.
              </p>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
                New Email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new@example.com"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 mb-6"
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send OTP'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={verifyOTP}>
              <p className="text-sm text-slate-600 mb-4">
                We&apos;ve sent a 6-digit verification code to <strong>{newEmail}</strong>.
              </p>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
                Verification Code
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-lg tracking-[0.2em] font-mono text-center focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 mb-6"
                autoFocus
              />
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm font-medium text-indigo-600 hover:underline"
                >
                  Change Email
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify & Update'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function UpdatePhoneModal({ onClose, onSuccess }: ModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [newPhone, setNewPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\+[1-9]\d{7,14}$/.test(newPhone.trim())) {
      setError('Enter a valid mobile number with country code (e.g., +919876543210)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || undefined;
      await apiPost('/api/auth/request-phone-update', { newPhone }, token);
      setStep(2);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || undefined;
      await apiPost('/api/auth/verify-phone-update', { newPhone, otp }, token);
      onSuccess(newPhone);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Update Mobile Number</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={requestOTP}>
              <p className="text-sm text-slate-600 mb-4">
                Enter your new mobile number. We will send a WhatsApp verification code to confirm
                ownership.
              </p>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
                New Mobile Number
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 mb-6"
                autoFocus
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send WhatsApp OTP'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={verifyOTP}>
              <p className="text-sm text-slate-600 mb-4">
                We&apos;ve sent a 6-digit WhatsApp code to <strong>{newPhone}</strong>.
              </p>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
                Verification Code
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-lg tracking-[0.2em] font-mono text-center focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 mb-6"
                autoFocus
              />
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm font-medium text-indigo-600 hover:underline"
                >
                  Change Number
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify & Update'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function PasswordUpdateModal({
  currentPassword,
  newPassword,
  onClose,
  onSuccess,
}: {
  currentPassword: string;
  newPassword: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const requestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || undefined;
      await apiPost('/api/auth/password-update/send-otp', { method }, token);
      setStep(2);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || undefined;
      const res = (await apiPut(
        '/api/auth/password-update/change',
        { currentPassword, newPassword, otp, method },
        token,
      )) as { token?: string };
      if (res.token) {
        localStorage.setItem('token', res.token);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Verify Password Change</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={requestOTP}>
              <p className="text-sm text-slate-600 mb-4">
                To protect your account, please verify this change. Where should we send the
                security code?
              </p>

              <div className="space-y-3 mb-6">
                <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="radio"
                    name="method"
                    value="email"
                    checked={method === 'email'}
                    onChange={() => setMethod('email')}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm font-medium">Email Address</span>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="radio"
                    name="method"
                    value="phone"
                    checked={method === 'phone'}
                    onChange={() => setMethod('phone')}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <span className="text-sm font-medium">Mobile Number (WhatsApp)</span>
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Security Code'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={verifyOTP}>
              <p className="text-sm text-slate-600 mb-4">
                We&apos;ve sent a 6-digit security code to your {method}.
              </p>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700 mb-1.5">
                Security Code
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-lg tracking-[0.2em] font-mono text-center focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 mb-6"
                autoFocus
              />
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm font-medium text-indigo-600 hover:underline"
                >
                  Change Method
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
