'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import BackButton from '@/components/BackButton';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const RAZORPAY_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';
const SUPPORT_EMAIL = 'admin@finlytix.in';
const SUPPORT_EMAIL_SUBJECT = 'Premium feature support';
const SUPPORT_EMAIL_BODY =
  'Hello Finlytix Support,\n\nI need help with a premium feature.\n\nDetails:\n';
const SUPPORT_COMPOSE_URL = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(
  SUPPORT_EMAIL,
)}&subject=${encodeURIComponent(SUPPORT_EMAIL_SUBJECT)}&body=${encodeURIComponent(
  SUPPORT_EMAIL_BODY,
)}`;
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  SUPPORT_EMAIL_SUBJECT,
)}&body=${encodeURIComponent(SUPPORT_EMAIL_BODY)}`;

interface PricingData {
  [key: string]: {
    name: string;
    amount: number;
    description: string;
  };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayFailureResponse {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
  };
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayResponse) => void | Promise<void>;
  prefill: {
    name: string;
    email: string;
  };
  theme: {
    color: string;
  };
  modal: {
    ondismiss: () => void;
  };
}

interface RazorpayCheckout {
  open: () => void;
  on: (event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void) => void;
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayCheckout;
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Razorpay checkout'));
    document.body.appendChild(script);
  });
}

function getStoredUser(): { name?: string; email?: string } {
  const storedUser = localStorage.getItem('user');
  if (!storedUser) {
    return {};
  }

  try {
    return JSON.parse(storedUser) as { name?: string; email?: string };
  } catch (err) {
    console.error('Failed to parse stored user:', err);
    return {};
  }
}

export default function PricingPage() {
  const [pricing, setPricing] = useState<PricingData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [purchasedFeatures, setPurchasedFeatures] = useState<Set<string>>(new Set());
  const router = useRouter();

  // Fetch pricing on mount
  useEffect(() => {
    const fetchPricingAndStatus = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/payments/pricing`);
        setPricing(response.data);

        // Check purchase status for each feature
        const token = localStorage.getItem('token');
        if (token) {
          const purchased = new Set<string>();
          for (const featureId of Object.keys(response.data)) {
            try {
              const statusResponse = await axios.get(
                `${API_BASE_URL}/api/payments/check/${featureId}`,
                { headers: { Authorization: `Bearer ${token}` } },
              );
              if (statusResponse.data.purchased) {
                purchased.add(featureId);
              }
            } catch (err) {
              console.error(`Failed to check purchase status for ${featureId}:`, err);
            }
          }
          setPurchasedFeatures(purchased);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching pricing:', err);
        setError('Failed to load pricing information');
        setLoading(false);
      }
    };

    void fetchPricingAndStatus();
  }, []);

  // Handle payment button click
  const handlePayment = async (featureId: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }

    setSelectedFeature(featureId);
    setProcessingPayment(true);
    setError('');

    try {
      const orderResponse = await axios.post(
        `${API_BASE_URL}/api/payments/create-order`,
        { featureId },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const { orderId, amount, razorpayKeyId, featureName } = orderResponse.data;

      if (!razorpayKeyId) {
        throw new Error('Payment gateway is not configured');
      }

      await loadRazorpayScript();

      const user = getStoredUser();
      const options: RazorpayOptions = {
        key: razorpayKeyId,
        amount,
        currency: 'INR',
        name: 'Finance Analytics',
        description: `Purchase: ${featureName}`,
        order_id: orderId,
        handler: async (response: RazorpayResponse) => {
          try {
            const verifyResponse = await axios.post(
              `${API_BASE_URL}/api/payments/verify`,
              {
                orderId,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              },
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            );

            if (verifyResponse.data.success) {
              setPurchasedFeatures((prev) => new Set([...prev, featureId]));
              setError('');
              alert('Payment successful! Feature unlocked. Redirecting...');
              setTimeout(() => {
                router.push('/dashboard');
              }, 1500);
            }
          } catch (verifyError) {
            console.error('Payment verification failed:', verifyError);
            setError('Payment verification failed. Please contact support.');
          } finally {
            setProcessingPayment(false);
          }
        },
        prefill: {
          name: user.name || '',
          email: user.email || '',
        },
        theme: {
          color: '#667eea',
        },
        modal: {
          ondismiss: () => {
            setProcessingPayment(false);
            setSelectedFeature(null);
          },
        },
      };

      const razorpayCheckout = new window.Razorpay(options);
      razorpayCheckout.on('payment.failed', (response) => {
        const message =
          response.error?.description ||
          response.error?.reason ||
          'Payment failed. Please try again.';
        setError(message);
        setProcessingPayment(false);
      });
      razorpayCheckout.open();
    } catch (err: unknown) {
      console.error('Error creating order:', err);
      setError(
        axios.isAxiosError<{ error?: string }>(err)
          ? err.response?.data?.error || 'Failed to create payment order'
          : err instanceof Error
            ? err.message
            : 'Failed to create payment order',
      );
      setProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <BackButton variant="dark" />
      </div>

      {/* Header */}
      <div className="pt-12 pb-8 px-4 text-center">
        <h1 className="text-5xl font-bold text-white mb-4">Premium Features</h1>
        <p className="text-xl text-blue-100 max-w-2xl mx-auto">
          Unlock advanced analytics and features to get more from your financial data
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 mb-8">
          <div className="bg-red-500/20 border border-red-500/50 text-red-100 px-6 py-4 rounded-lg flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <div>
              <p className="font-semibold">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        {loading ? (
          <div className="flex justify-center items-center h-96">
            <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(pricing).map(([featureId, feature]) => (
              <div
                key={featureId}
                className="bg-white/10 backdrop-blur-xl rounded-xl shadow-lg p-6 border border-white/20 hover:border-blue-400/50 transition group"
              >
                {/* Feature Name */}
                <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-300 transition">
                  {feature.name}
                </h3>

                {/* Price */}
                <div className="mb-4">
                  <div className="text-4xl font-bold text-blue-400 mb-1">₹{feature.amount}</div>
                  <p className="text-sm text-gray-300">One-time purchase</p>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-300 mb-6 min-h-[48px]">{feature.description}</p>

                {/* Features List */}
                <div className="space-y-3 mb-6 pb-6 border-b border-white/10">
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <svg
                      className="w-4 h-4 text-green-400 flex-shrink-0 mt-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    <span>Instant access</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <svg
                      className="w-4 h-4 text-green-400 flex-shrink-0 mt-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    <span>Secure payment</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <svg
                      className="w-4 h-4 text-green-400 flex-shrink-0 mt-1"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    <span>24/7 support</span>
                  </div>
                </div>

                {/* Buy Button */}
                {purchasedFeatures.has(featureId) ? (
                  <button
                    disabled
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold py-3 rounded-lg transition flex items-center justify-center gap-2 opacity-75 cursor-not-allowed"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    Unlocked
                  </button>
                ) : (
                  <button
                    onClick={() => handlePayment(featureId)}
                    disabled={processingPayment}
                    className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-3 rounded-lg transition transform hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100 cursor-pointer"
                  >
                    {processingPayment && selectedFeature === featureId ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Processing...
                      </div>
                    ) : (
                      `Buy for ₹${feature.amount}`
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-gradient-to-r from-blue-500/20 to-indigo-600/20 border border-blue-400/30 rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-3">Need help?</h2>
          <p className="text-blue-100 mb-6">
            Contact our support team for any questions about premium features
          </p>
          <a
            href={SUPPORT_COMPOSE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition cursor-pointer"
          >
            Contact Support in Outlook
          </a>
          <p className="text-sm text-blue-100/80 mt-4">
            Or email us directly at{' '}
            <a className="underline hover:text-white" href={SUPPORT_MAILTO}>
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
