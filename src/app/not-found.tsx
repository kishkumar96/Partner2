/**
 * Not Found (404) Page
 */
import Link from 'next/link';
import { Home, Search, MapPin } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        {/* 404 Animation */}
        <div className="relative mb-8">
          <h1 className="text-9xl font-bold text-slate-800/50 select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <MapPin className="w-24 h-24 text-blue-500 animate-bounce" />
          </div>
        </div>

        <h2 className="text-4xl font-bold text-white mb-4">
          Page Not Found
        </h2>
        
        <p className="text-xl text-slate-400 mb-8">
          We couldn't find the climate data you're looking for.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/20"
          >
            <Home className="w-5 h-5" />
            Back to Dashboard
          </Link>
          
          <a
            href="mailto:support@example.com"
            className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            <Search className="w-5 h-5" />
            Contact Support
          </a>
        </div>

        {/* Helpful links */}
        <div className="mt-12 p-6 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">
            Popular Sections
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <Link
              href="/"
              className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white"
            >
              Impact Analysis
            </Link>
            <Link
              href="/"
              className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white"
            >
              Regional Data
            </Link>
            <Link
              href="/"
              className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white"
            >
              Documentation
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
