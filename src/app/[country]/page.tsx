import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DashboardView from '@/components/DashboardView';
import { COUNTRIES } from '@/types/thredds';
import { isCountryProtected } from '@/lib/countryAuth';
import { CODE_TO_SLUG, getCountryCodeFromSlug } from '@/utils/countrySlug';
import { getTenantCountryCodeFromEnv } from '@/utils/tenantCountry';

interface CountryPageProps {
  params: Promise<{ country: string }>;
}

export function generateStaticParams() {
  const tenantCountryCode = getTenantCountryCodeFromEnv();
  if (tenantCountryCode) {
    return [{ country: CODE_TO_SLUG[tenantCountryCode] }];
  }

  return Object.values(CODE_TO_SLUG).map(country => ({ country }));
}

export async function generateMetadata({ params }: CountryPageProps): Promise<Metadata> {
  const { country } = await params;
  const countryCode = getCountryCodeFromSlug(country);

  if (!countryCode || !Object.prototype.hasOwnProperty.call(COUNTRIES, countryCode)) {
    return {
      title: 'Country Not Found',
      description: 'Requested country route was not found.',
    };
  }

  const countryInfo = COUNTRIES[countryCode];

  return {
    title: `${countryInfo.name} Pacific Disaster Platform`,
    description: `Operational hazard, exposure, and impact view for ${countryInfo.fullName}.`,
  };
}

export default async function CountryPage({ params }: CountryPageProps) {
  const { country } = await params;
  const countryCode = getCountryCodeFromSlug(country);
  const tenantCountryCode = getTenantCountryCodeFromEnv();

  if (!countryCode || !Object.prototype.hasOwnProperty.call(COUNTRIES, countryCode)) {
    notFound();
  }

  if (tenantCountryCode && countryCode !== tenantCountryCode) {
    notFound();
  }

  return (
    <DashboardView
      countryCode={countryCode}
      allowCountrySwitch={false}
      showLogout={isCountryProtected(countryCode)}
    />
  );
}
