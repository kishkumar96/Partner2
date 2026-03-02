import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DashboardView from '@/components/DashboardView';
import { COUNTRIES } from '@/types/thredds';
import { SLUG_TO_CODE, CODE_TO_SLUG } from '@/utils/countrySlug';

interface CountryPageProps {
  params: { country: string };
}

export function generateStaticParams() {
  return Object.values(CODE_TO_SLUG).map(country => ({ country }));
}

export function generateMetadata({ params }: CountryPageProps): Metadata {
  const countryCode = SLUG_TO_CODE[params.country];

  if (!countryCode) {
    return {
      title: 'Country Not Found',
      description: 'Requested country route was not found.',
    };
  }

  const country = COUNTRIES[countryCode];

  return {
    title: `${country.name} Climate Risk Dashboard`,
    description: `Climate risk analytics, hazards, and impact view for ${country.fullName}.`,
  };
}

export default function CountryPage({ params }: CountryPageProps) {
  const countryCode = SLUG_TO_CODE[params.country];

  if (!countryCode) {
    notFound();
  }

  return <DashboardView countryCode={countryCode} />;
}
