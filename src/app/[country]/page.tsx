import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import DashboardView from '@/components/DashboardView';
import { COUNTRIES } from '@/types/thredds';
import { SLUG_TO_CODE, CODE_TO_SLUG } from '@/utils/countrySlug';

interface CountryPageProps {
  params: Promise<{ country: string }>;
}

export function generateStaticParams() {
  return Object.values(CODE_TO_SLUG).map(country => ({ country }));
}

export async function generateMetadata({ params }: CountryPageProps): Promise<Metadata> {
  const { country } = await params;
  const countryCode = SLUG_TO_CODE[country];

  if (!countryCode) {
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
  const countryCode = SLUG_TO_CODE[country];

  if (!countryCode) {
    notFound();
  }

  return <DashboardView countryCode={countryCode} />;
}
