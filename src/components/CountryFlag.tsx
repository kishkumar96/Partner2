'use client';

import { CSSProperties, useMemo, useState } from 'react';
import { CountryCode, COUNTRIES } from '@/types/thredds';
import { getConfiguredBasePath, prependBasePath } from '@/utils/basePath';

const FLAG_IMAGE_PATHS: Record<CountryCode, string> = {
  VU: '/pdf-assets/Country_Flags/Flag_of_Vanuatu.svg.png',
  WS: '/pdf-assets/Country_Flags/Flag_of_Samoa.svg.png',
  TO: '/pdf-assets/Country_Flags/Flag_of_Tonga.svg.png',
  CK: '/pdf-assets/Country_Flags/2000px-Flag_of_the_Cook_Islands.svg.png',
};

const BASE_PATH = getConfiguredBasePath(process.env.NODE_ENV === 'production' ? '/partner2' : '');

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
  const [hasLoadError, setHasLoadError] = useState(false);
  const flagSrc = useMemo(
    () => prependBasePath(FLAG_IMAGE_PATHS[countryCode], BASE_PATH),
    [countryCode]
  );
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
      onError={() => setHasLoadError(true)}
      style={{
        ...sharedStyle,
        objectFit: 'cover',
      }}
    />
  );
}
