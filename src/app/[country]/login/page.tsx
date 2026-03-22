'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Globe2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
import { SLUG_TO_CODE } from '@/utils/countrySlug';
import { COUNTRIES } from '@/types/thredds';

interface LoginPageProps {
  params: Promise<{ country: string }>;
}

export default function CountryLoginPage({ params }: LoginPageProps) {
  const router = useRouter();
  const [country, setCountry] = useState<string>('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    params.then(({ country: slug }) => setCountry(slug));
    inputRef.current?.focus();
  }, [params]);

  const countryCode = SLUG_TO_CODE[country?.toLowerCase() ?? ''];
  const countryName = countryCode ? COUNTRIES[countryCode]?.name : country;

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, password }),
      });

      if (res.ok) {
        router.replace(`/${country}`);
        router.refresh();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Incorrect access code. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/40 via-slate-950 to-slate-950 pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="glass-panel rounded-2xl border border-white/10 p-8 shadow-2xl backdrop-blur-xl">
          {/* Globe icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Globe2 className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-100">
              {countryName ? `${countryName} Dashboard` : 'PDIE Dashboard'}
            </h1>
            {countryCode && (
              <div className="mt-3 flex items-center justify-center gap-2 text-slate-300">
                <ReactCountryFlag
                  countryCode={countryCode}
                  svg
                  aria-label={COUNTRIES[countryCode].name}
                  title={COUNTRIES[countryCode].name}
                  className="w-5 h-5"
                />
                <span className="text-sm font-medium">{COUNTRIES[countryCode].name}</span>
              </div>
            )}
            <p className="text-sm text-slate-400 mt-2">
              This section is restricted. Enter your access code to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="access-code"
                className="block text-xs font-semibold text-slate-400 uppercase tracking-wider"
              >
                Access Code
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-slate-500" />
                </div>
                <input
                  ref={inputRef}
                  id="access-code"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter access code"
                  className="w-full pl-10 pr-10 py-3 bg-slate-800/70 border border-slate-700/60 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all text-sm"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full py-3 px-4 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:shadow-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying…
                </span>
              ) : (
                'Access Dashboard'
              )}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-slate-600 mt-6">
            PDIE — Pacific Disaster Impact Estimation
          </p>
        </div>
      </div>
    </div>
  );
}
