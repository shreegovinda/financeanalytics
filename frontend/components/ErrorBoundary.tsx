'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mx-auto mb-4">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4v2m0 4v2m0-12a9 9 0 110-18 9 9 0 010 18z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 text-center mb-2">
              Something went wrong
            </h3>
            <p className="text-sm text-gray-500 text-center mb-4">
              We encountered an unexpected error. Please try refreshing the page or going back to
              the dashboard.
            </p>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 p-3 bg-gray-100 rounded text-xs text-gray-600">
                <summary className="cursor-pointer font-medium">Error details (Dev only)</summary>
                <pre className="mt-2 overflow-auto max-h-40">{this.state.error?.message}</pre>
              </details>
            )}
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => (window.location.href = '/dashboard')}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
              >
                Go to Dashboard
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition text-sm font-medium"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
