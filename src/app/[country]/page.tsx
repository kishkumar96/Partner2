import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DashboardView from '@/components/DashboardView';
import { COUNTRIES } from '@/types/thredds';
import { CODE_TO_SLUG, getCountryCodeFromSlug } from '@/utils/countrySlug';

interface CountryPageProps {
  params: Promise<{ country: string }>;
}

export function generateStaticParams() {
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
    title: `${countryInfo.name} Climate Risk Dashboard`,
    description: `Climate risk analytics, hazards, and impact view for ${countryInfo.fullName}.`,
  };
}

export default async function CountryPage({ params }: CountryPageProps) {
  const { country } = await params;
  const countryCode = getCountryCodeFromSlug(country);

  if (!countryCode || !Object.prototype.hasOwnProperty.call(COUNTRIES, countryCode)) {
    notFound();
  }

  return <DashboardView countryCode={countryCode} />;
}
