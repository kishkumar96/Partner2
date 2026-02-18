/**
 * Global Error Handler
 * Handles Next.js app-level errors
 */
'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);

    // You can send to error tracking service here
    // logErrorToService(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-700/50 p-8 text-center">
        <div className="inline-flex items-center justify-center p-4 bg-orange-500/20 rounded-full mb-6">
          <AlertTriangle className="w-12 h-12 text-orange-400" />
        </div>

        <h2 className="text-3xl font-bold text-white mb-3">Oops! Something went wrong</h2>

        <p className="text-slate-400 mb-6">
          We&apos;re sorry for the inconvenience. The application encountered an unexpected error.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 text-left">
            <p className="text-sm font-semibold text-red-400 mb-2">Error Message:</p>
            <p className="text-sm text-slate-300 font-mono">{error.message}</p>
            {error.digest && (
              <p className="text-xs text-slate-500 mt-2">Error ID: {error.digest}</p>
            )}
          </div>
        )}

        <button
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/20"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
