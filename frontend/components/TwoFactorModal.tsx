import { useState } from 'react';
import { apiPost, getErrorMessage } from '@/lib/api';

export function TwoFactorModal({
  currentMethod,
  onClose,
  onSuccess,
}: {
  currentMethod: string;
  onClose: () => void;
  onSuccess: (newMethod: string) => void;
}) {
  const [step, setStep] = useState<'select' | 'setup_authenticator' | 'verify' | 'disable'>(
    currentMethod !== 'none' ? 'disable' : 'select',
  );
  const [method, setMethod] = useState(currentMethod === 'none' ? 'authenticator' : currentMethod);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token') || undefined;
      if (method === 'authenticator') {
        const res = (await apiPost('/api/auth/2fa/setup-authenticator', {}, token)) as {
          qrCode: string;
          secret: string;
        };
        setQrCode(res.qrCode);
        setSecret(res.secret);
        setStep('setup_authenticator');
      } else {
        // Phone or Email - request an enrollment code under the 2FA purpose.
        await apiPost('/api/auth/2fa/send-otp', { method }, token);
        setStep('verify');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || undefined;
      await apiPost('/api/auth/2fa/enable', { method, secret, otp }, token);
      onSuccess(method);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') || undefined;
      await apiPost('/api/auth/2fa/disable', { password }, token);
      onSuccess('none');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900">Two-Factor Authentication</h2>
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

          {step === 'select' && (
            <form onSubmit={handleNext}>
              <p className="text-sm text-slate-600 mb-4">
                Choose a method to receive your two-factor authentication codes.
              </p>

              <div className="space-y-3 mb-6">
                <label className="flex flex-col p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="method"
                      value="authenticator"
                      checked={method === 'authenticator'}
                      onChange={() => setMethod('authenticator')}
                      className="w-4 h-4 text-indigo-600"
                    />
                    <span className="text-sm font-bold">Authenticator App</span>
                  </div>
                  <span className="text-xs text-slate-500 ml-7 mt-1">
                    Google Authenticator, Authy, etc. (Recommended)
                  </span>
                </label>
                <label className="flex flex-col p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition opacity-50">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="method"
                      value="email"
                      disabled
                      checked={method === 'email'}
                      onChange={() => setMethod('email')}
                      className="w-4 h-4 text-indigo-600"
                    />
                    <span className="text-sm font-bold">Email (Coming soon)</span>
                  </div>
                </label>
                <label className="flex flex-col p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition opacity-50">
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="method"
                      value="phone"
                      disabled
                      checked={method === 'phone'}
                      onChange={() => setMethod('phone')}
                      className="w-4 h-4 text-indigo-600"
                    />
                    <span className="text-sm font-bold">WhatsApp (Coming soon)</span>
                  </div>
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
                  {loading ? 'Setting up...' : 'Continue'}
                </button>
              </div>
            </form>
          )}

          {step === 'setup_authenticator' && (
            <form onSubmit={handleEnable}>
              <p className="text-sm text-slate-600 mb-4">
                Scan this QR code with your Authenticator App, then enter the 6-digit code below to
                confirm.
              </p>

              <div className="flex justify-center mb-4">
                {qrCode /* eslint-disable-next-line @next/next/no-img-element */ ? (
                  <img src={qrCode} alt="QR Code" className="w-48 h-48 border rounded-xl" />
                ) : (
                  <div className="w-48 h-48 bg-slate-100 animate-pulse rounded-xl" />
                )}
              </div>

              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-center text-xl tracking-widest font-mono focus:border-indigo-500 mb-6"
                autoFocus
              />

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep('select')}
                  className="text-sm font-medium text-indigo-600 hover:underline"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6}
                  className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Enable 2FA'}
                </button>
              </div>
            </form>
          )}

          {step === 'disable' && (
            <form onSubmit={handleDisable}>
              <p className="text-sm text-slate-600 mb-4">
                Two-Factor Authentication is currently enabled via <strong>{currentMethod}</strong>.
                To disable it, enter your account password.
              </p>

              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm mb-6"
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
                  disabled={loading || !password}
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50"
                >
                  {loading ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
