import Link from 'next/link';
import { redirect } from 'next/navigation';
import CountryFlag from '@/components/CountryFlag';
import { COUNTRIES } from '@/types/thredds';
import { CODE_TO_SLUG } from '@/utils/countrySlug';
import { getTenantCountryCodeFromEnv } from '@/utils/tenantCountry';

export default function RootPage() {
  const tenantCountryCode = getTenantCountryCodeFromEnv();
  if (tenantCountryCode) {
    redirect(`/${CODE_TO_SLUG[tenantCountryCode]}`);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Select A Country</h1>
        <p className="mt-3 text-slate-300">
          Choose a country dashboard. Each country has isolated data in its own route.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {Object.values(COUNTRIES).map(country => {
            const slug = CODE_TO_SLUG[country.code];
            return (
              <Link
                key={country.code}
                href={`/${slug}`}
                prefetch={false}
                className="rounded-xl border border-slate-700 bg-slate-900/70 p-5 transition hover:border-blue-500 hover:bg-slate-900"
              >
                <div className="text-2xl">
                  <CountryFlag
                    countryCode={country.code}
                    aria-label={country.name}
                    title={country.name}
                    className="w-7 h-7"
                  />
                </div>
                <div className="mt-2 text-lg font-semibold">{country.name}</div>
                <div className="text-sm text-slate-400">{country.fullName}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
