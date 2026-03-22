declare module 'react-country-flag' {
  import * as React from 'react';

  interface ReactCountryFlagProps {
    countryCode: string;
    svg?: boolean;
    cdnUrl?: string;
    cdnSuffix?: string;
    style?: React.CSSProperties;
    className?: string;
    title?: string;
    'aria-label'?: string;
  }

  const ReactCountryFlag: React.FC<ReactCountryFlagProps>;
  export default ReactCountryFlag;
}