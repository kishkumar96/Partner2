/**
 * Types for THREDDS server data integration
 */

export type CountryCode = "VU" | "WS" | "TO" | "CK";

export interface Country {
  code: CountryCode;
  name: string;
  fullName: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
}

export interface THREDDSDataSource {
  baseUrl: string;
  hazardPath: string;
  riskPath: string;
}

export interface GeoTIFFLayer {
  id: string;
  name: string;
  url: string;
  type: "hazard" | "risk";
  hazardType?: string;
  countryCode: CountryCode;
}

export interface CycloneTrack {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "LineString" | "Point";
      coordinates: number[][];
    };
    properties: {
      name?: string;
      intensity?: string;
      date?: string;
      [key: string]: any;
    };
  }>;
}

export const COUNTRIES: Record<CountryCode, Country> = {
  VU: {
    code: "VU",
    name: "Vanuatu",
    fullName: "Republic of Vanuatu",
    center: [166.9592, -15.3767],
    zoom: 7,
  },
  WS: {
    code: "WS",
    name: "Samoa",
    fullName: "Independent State of Samoa",
    center: [-172.1046, -13.759],
    zoom: 9,
  },
  TO: {
    code: "TO",
    name: "Tonga",
    fullName: "Kingdom of Tonga",
    center: [-175.198, -21.179],
    zoom: 8,
  },
  CK: {
    code: "CK",
    name: "Cook Islands",
    fullName: "Cook Islands",
    center: [-159.7777, -21.2367],
    zoom: 6,
  },
};

export const THREDDS_CONFIG: THREDDSDataSource = {
  baseUrl: "https://gemthreddshpc.spc.int/thredds",
  hazardPath: "/POP/Partner2/case_study2/hazard",
  riskPath: "/POP/Partner2/case_study2/pdie_ini",
};
