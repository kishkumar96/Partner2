import type { Metadata } from 'next';
import Link from 'next/link';
import OperatorConsole from '@/components/OperatorConsole';

export const metadata: Metadata = {
  title: 'Cyclone Track Submission',
  robots: { index: false, follow: false },
};

export default function OperatorPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Tropical Cyclone Rapid Impact Assessment · Operators
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Cyclone track submission</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Submit a forecast track to start a rapid impact run, or a post-event best track to start
          the PDNA chain. Results appear on the country dashboard when the run completes.
        </p>
        <div className="mt-8">
          <OperatorConsole />
        </div>
        <p className="mt-12 text-xs text-slate-500">
          <Link href="/" className="underline">
            Back to the country dashboards
          </Link>
        </p>
      </div>
    </main>
  );
}
