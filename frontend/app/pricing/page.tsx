'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

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

export default function PricingPage() {
  const [pricing, setPricing] = useState<PricingData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const router = useRouter();

  // Fetch pricing on mount
  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const response = await axios.get('http://localhost:3001/api/payments/pricing');
        setPricing(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching pricing:', err);
        setError('Failed to load pricing information');
        setLoading(false);
      }
    };

    fetchPricing();
  }, []);

  // Handle payment button click
  const handlePayment = async (featureId: string) => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }

    setProcessingPayment(true);
    setError('');

    try {
      // Create order
      const orderResponse = await axios.post(
        'http://localhost:3001/api/payments/create-order',
        { featureId },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const { orderId, amount, razorpayKeyId, featureName } = orderResponse.data;

      // Load Razorpay script
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        const options = {
          key: razorpayKeyId,
          amount: amount,
          currency: 'INR',
          name: 'Finance Analytics',
          description: `Purchase: ${featureName}`,
          order_id: orderId,
          handler: async (response: RazorpayResponse) => {
            try {
              // Verify payment
              const verifyResponse = await axios.post(
                'http://localhost:3001/api/payments/verify',
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
                alert('Payment successful! Thank you for your purchase.');
                router.push('/dashboard');
              }
            } catch (verifyError) {
              console.error('Payment verification failed:', verifyError);
              setError('Payment verification failed. Please contact support.');
            }
          },
          prefill: {
            name: localStorage.getItem('user')
              ? JSON.parse(localStorage.getItem('user') || '{}').name
              : '',
            email: localStorage.getItem('user')
              ? JSON.parse(localStorage.getItem('user') || '{}').email
              : '',
          },
          theme: {
            color: '#667eea',
          },
        };

        // @ts-ignore
        const razorpayCheckout = new window.Razorpay(options);
        razorpayCheckout.open();
      };
      document.body.appendChild(script);
    } catch (err: any) {
      console.error('Error creating order:', err);
      setError(err.response?.data?.error || 'Failed to create payment order');
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
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
                  <div className="text-4xl font-bold text-blue-400 mb-1">
                    ₹{feature.amount}
                  </div>
                  <p className="text-sm text-gray-300">One-time purchase</p>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-300 mb-6 min-h-[48px]">
                  {feature.description}
                </p>

                {/* Features List */}
                <div className="space-y-3 mb-6 pb-6 border-b border-white/10">
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-green-400 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    <span>Instant access</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-green-400 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    <span>Secure payment</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-gray-300">
                    <svg className="w-4 h-4 text-green-400 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    <span>24/7 support</span>
                  </div>
                </div>

                {/* Buy Button */}
                <button
                  onClick={() => handlePayment(featureId)}
                  disabled={processingPayment}
                  className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-3 rounded-lg transition transform hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {processingPayment ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </div>
                  ) : (
                    `Buy for ₹${feature.amount}`
                  )}
                </button>
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
            href="mailto:support@finlytix.in"
            className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition"
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
