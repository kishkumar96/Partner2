# Cyclone categories

The cyclone badge, track markers, timeline, charts and share cards use the same
source-aware category representation. Category is maximum storm intensity, not
the wind or impact expected at every location around it.

## Source contract

The existing RSMC CSV and partner geometry adapters accept wind columns in knots,
as documented by `cycloneForecastSchema.ts`. An explicit `WindUnit` overrides that
contract. Supported units are `kt`, `km/h` and `m/s`; unsupported units leave wind
unavailable. Normalised point wind values are always knots.

Optional metadata can be supplied per row (`CategoryScale`, `WindUnit`,
`AveragingMinutes`, `TrackPhase`, `DataSource`, `CycloneStatus`), with snake-case
aliases for the first four. Loaders also accept a `CycloneSourceContext` for a
documented source adapter. Explicit row metadata takes precedence, including
unsupported values, which must not silently fall back to an adapter assumption.

Valid reported categories 1–5 are preserved even if the scale is unspecified or
wind is missing. The app does not determine scale from the country, filename,
storm name or category/wind agreement. Missing values remain null; no synthetic
gust or default pressure is presented as a measurement.

Missing categories can be derived only with a known scale, supported units and
the matching wind averaging period:

| Scale | Averaging period | Category 1–5 lower thresholds, knots |
| --- | --- | --- |
| Australian | 10 minutes | 34, 48, 64, 86, 108 |
| Saffir–Simpson | 1 minute | 64, 83, 96, 113, 137 |

References: [MetService](https://about.metservice.com/tropical-cyclone-monitoring)
and [National Hurricane Center](https://www.nhc.noaa.gov/aboutsshws.php).

The app converts units, never averaging periods. Invalid category values and
non-category codes are neutral, not tropical-storm classifications. Explicit
ex-tropical/depression/disturbance status prevents deriving a new cyclone
category; supplied source status remains visible separately.

## Interaction and rendering

The existing playback index controls the badge, timeline, map marker and chart.
Timeline buttons, its keyboard-accessible slider, chart selection and map-point
selection all seek the same controller. Times are labelled UTC. Changing panels
does not create a second playback controller.

Category numbers supplement colours; unknown points use grey and `?`. Forecast
segments are dashed only when the source explicitly identifies their phase.
Solid segments can be observed or unspecified and must not be described as
observations without source metadata. Number labels require a basemap glyph set;
the badge and timeline remain available without one.

Legends show thresholds only for a known scale. Local wind footprints and
exposure remain separate layers; category is not assigned to islands or EEZs.

Existing animation wind-radius estimates are flagged on the point and identified
in the controls. They are kept separate from source wind/gust measurements and
from modelled local exposure.
