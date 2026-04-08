'use client';

import { CSSProperties, useMemo, useState } from 'react';
import { CountryCode, COUNTRIES } from '@/types/thredds';

const FLAG_IMAGE_PATHS: Record<CountryCode, string> = {
  VU: '/pdf-assets/Country_Flags/Flag_of_Vanuatu.svg.png',
  WS: '/pdf-assets/Country_Flags/Flag_of_Samoa.svg.png',
  TO: '/pdf-assets/Country_Flags/Flag_of_Tonga.svg.png',
  CK: '/pdf-assets/Country_Flags/2000px-Flag_of_the_Cook_Islands.svg.png',
};

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

interface CountryFlagProps {
  countryCode: CountryCode;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  'aria-label'?: string;
}

export default function CountryFlag({
  countryCode,
  size = '1rem',
  className,
  style,
  title,
  'aria-label': ariaLabel,
}: CountryFlagProps) {
  const countryName = COUNTRIES[countryCode].name;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const flagSrc = useMemo(() => `${BASE_PATH}${FLAG_IMAGE_PATHS[countryCode]}`, [countryCode]);
  const hasLoadError = failedSrc === flagSrc;

  const fallbackLabel = countryName
    .split(/\s+/)
    .map(part => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const sharedStyle: CSSProperties = {
    display: 'inline-block',
    width: size,
    height: 'auto',
    verticalAlign: 'middle',
    ...style,
  };

  if (hasLoadError) {
    return (
      <span
        role="img"
        aria-label={ariaLabel ?? `${countryName} flag unavailable`}
        title={title ?? countryName}
        className={className}
        style={{
          ...sharedStyle,
          aspectRatio: '4 / 3',
          borderRadius: 2,
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: '#e2e8f0',
          fontSize: '0.5em',
          fontWeight: 700,
          lineHeight: 1,
          textAlign: 'center',
          alignContent: 'center',
          overflow: 'hidden',
        }}
      >
        {fallbackLabel}
      </span>
    );
  }

  return (
    <img
      src={flagSrc}
      alt={ariaLabel ?? `${countryName} flag`}
      aria-label={ariaLabel ?? countryName}
      title={title ?? countryName}
      className={className}
      width={24}
      height={18}
      onError={() => setFailedSrc(flagSrc)}
      style={{
        ...sharedStyle,
        objectFit: 'cover',
      }}
    />
  );
}
