'use client';

import { forwardRef } from 'react';
import { WIND_DANGER_ORDER, windDangerColor } from '@/utils/forecastExposure';
import {
  FACILITY_COLORS,
  FLOODPLAIN_COLOR,
  PRIORITY_COLORS,
  TRACK_COLOR,
} from '@/utils/forecastColors';
import type { ForecastBriefModel } from '@/utils/forecastBrief';
import type { PriorityLevel } from '@/utils/responsePriority';

/**
 * The Rapid Exposure Forecast operational brief: two A4 pages. A dedicated
 * template, not the damage/loss report, with its own amber/blue identity so it
 * can't be mistaken for a post-event assessment. The root's direct children are
 * the pages, which the export renders one by one.
 */

const NAVY = '#0b3a66';
const BLUE = '#1d4ed8';
const AMBER = '#f59e0b';
const INK = '#0f172a';
const MUTED = '#475569';

const PAGE: React.CSSProperties = {
  width: '210mm',
  height: '297mm',
  boxSizing: 'border-box',
  background: '#ffffff',
  color: INK,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const FRESHNESS_STYLE: Record<ForecastBriefModel['freshness']['kind'], { bg: string; fg: string }> =
  {
    superseded: { bg: '#b91c1c', fg: '#ffffff' },
    old: { bg: '#fde68a', fg: '#78350f' },
    unknown: { bg: '#fde68a', fg: '#78350f' },
    'latest-known': { bg: '#dbeafe', fg: NAVY },
  };

const LEVEL_STYLE: Record<PriorityLevel, { bg: string; fg: string }> = {
  red: { bg: PRIORITY_COLORS.red, fg: '#ffffff' },
  amber: { bg: PRIORITY_COLORS.amber, fg: '#1f2937' },
  green: { bg: PRIORITY_COLORS.green, fg: '#ffffff' },
  grey: { bg: PRIORITY_COLORS.grey, fg: '#ffffff' },
};

const LEVEL_WORD: Record<PriorityLevel, string> = {
  red: 'RED',
  amber: 'AMBER',
  green: 'GREEN',
  grey: 'GREY',
};

function Footer({ brief, page }: { brief: ForecastBriefModel; page: number }) {
  return (
    <div
      style={{
        marginTop: 'auto',
        borderTop: `0.6mm solid ${AMBER}`,
        padding: '2mm 10mm 3mm',
        fontSize: '7.5pt',
        color: MUTED,
        display: 'flex',
        justifyContent: 'space-between',
        gap: '6mm',
      }}
    >
      <span style={{ fontWeight: 700, color: NAVY }}>{brief.disclaimer}</span>
      <span style={{ whiteSpace: 'nowrap' }}>
        Pacific Disaster Impact &amp; Exposure · Page {page} of 2
      </span>
    </div>
  );
}

function Swatch({ color, round }: { color: string; round?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '2.6mm',
        height: '2.6mm',
        marginRight: '1mm',
        background: color,
        borderRadius: round ? '50%' : '0.4mm',
        border: '0.2mm solid #94a3b8',
        verticalAlign: 'middle',
      }}
    />
  );
}

/** Printed legend, so the brief doesn't depend on the map screenshot to explain itself. */
function Legend({ active }: { active: string[] }) {
  const on = (id: string) => active.includes(id);
  const bands = [...WIND_DANGER_ORDER].reverse();
  return (
    <div style={{ fontSize: '6.5pt', color: INK, lineHeight: 1.5 }}>
      <div>
        <strong style={{ color: NAVY }}>Strongest forecast wind: </strong>
        {bands.map(band => (
          <span key={band} style={{ marginRight: '2.5mm', whiteSpace: 'nowrap' }}>
            <Swatch color={windDangerColor(band)} />
            {band.replace(/ Winds$/, '')}
          </span>
        ))}
      </div>
      <div>
        {on('track') && (
          <span style={{ marginRight: '3mm', whiteSpace: 'nowrap' }}>
            <Swatch color={TRACK_COLOR} />
            Forecast track
          </span>
        )}
        {on('facilities') &&
          Object.entries(FACILITY_COLORS).map(([asset, color]) => (
            <span key={asset} style={{ marginRight: '3mm', whiteSpace: 'nowrap' }}>
              <Swatch color={color} round />
              {asset}
            </span>
          ))}
        {on('floodplain') && (
          <span style={{ marginRight: '3mm', whiteSpace: 'nowrap' }}>
            <Swatch color={FLOODPLAIN_COLOR} />
            Floodplain exposure
          </span>
        )}
        {on('priority') &&
          (['red', 'amber', 'green', 'grey'] as const).map(level => (
            <span key={level} style={{ marginRight: '2.5mm', whiteSpace: 'nowrap' }}>
              <Swatch color={PRIORITY_COLORS[level]} />
              Priority {level}
            </span>
          ))}
      </div>
    </div>
  );
}

function Table({
  table,
  maxRows = 12,
}: {
  table: { title: string; headers: string[]; rows: string[][] };
  maxRows?: number;
}) {
  // The brief is deliberately a two-page operational product. Keep dense or
  // unexpectedly large uploads from pushing its decision context below the
  // A4 footer; the complete, row-level data remains available through CSV.
  const visibleRows = table.rows.slice(0, maxRows);
  const remainingRows = table.rows.length - visibleRows.length;
  return (
    <div style={{ marginBottom: '5mm' }}>
      <div
        style={{
          fontSize: '8.5pt',
          fontWeight: 800,
          letterSpacing: '0.04em',
          color: NAVY,
          borderBottom: `0.5mm solid ${AMBER}`,
          paddingBottom: '1mm',
          marginBottom: '1.5mm',
        }}
      >
        {table.title}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
        <thead>
          <tr style={{ background: '#eff6ff', color: NAVY }}>
            {table.headers.map((header, i) => (
              <th
                key={header}
                style={{
                  textAlign: i === 0 ? 'left' : 'right',
                  padding: '1mm 1.5mm',
                  fontWeight: 700,
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(row => (
            <tr key={row[0]} style={{ borderBottom: '0.2mm solid #e2e8f0' }}>
              {row.map((cell, i) => (
                <td
                  key={i}
                  style={{
                    textAlign: i === 0 ? 'left' : 'right',
                    padding: '0.9mm 1.5mm',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {remainingRows > 0 && (
            <tr>
              <td
                colSpan={table.headers.length}
                style={{ padding: '1.2mm 1.5mm', color: MUTED, fontStyle: 'italic' }}
              >
                {remainingRows} more {remainingRows === 1 ? 'area' : 'areas'} available in the CSV
                export.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

interface REFPDFTemplateProps {
  brief: ForecastBriefModel;
  mapImageUrl?: string;
  qrCodeSrc?: string;
  /** Overlay ids switched on in the map, to print the matching legend */
  activeLayers: string[];
}

const REFPDFTemplate = forwardRef<HTMLDivElement, REFPDFTemplateProps>(
  ({ brief, mapImageUrl, qrCodeSrc, activeLayers }, ref) => {
    const fresh = FRESHNESS_STYLE[brief.freshness.kind];
    return (
      <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: '4mm' }}>
        {/* ───────── Page 1: decision brief ───────── */}
        <div style={PAGE} data-testid="ref-brief-page-1">
          <div style={{ background: NAVY, color: '#ffffff', padding: '6mm 10mm 4mm' }}>
            <div style={{ fontSize: '8pt', letterSpacing: '0.12em', color: '#bfdbfe' }}>
              PACIFIC DISASTER IMPACT & EXPOSURE
            </div>
            <div
              style={{ fontSize: '9pt', fontWeight: 800, letterSpacing: '0.08em', color: AMBER }}
            >
              {brief.kicker}
            </div>
            <div
              style={{
                fontSize: '20pt',
                fontWeight: 800,
                lineHeight: 1.15,
                marginTop: '1mm',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
              }}
            >
              {brief.heading}
            </div>
            <div style={{ fontSize: '8.5pt', color: '#dbeafe', marginTop: '1mm' }}>
              {brief.timesLine}
            </div>
          </div>
          <div
            style={{
              background: fresh.bg,
              color: fresh.fg,
              padding: '2mm 10mm',
              fontSize: '9pt',
              fontWeight: 800,
            }}
            data-testid="ref-brief-freshness"
          >
            {brief.freshness.text}
          </div>

          <div style={{ padding: '3mm 10mm 0' }}>
            <div
              style={{
                height: '92mm',
                background: '#e2e8f0',
                border: `0.3mm solid ${NAVY}`,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {mapImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mapImageUrl}
                  alt="Forecast wind exposure map"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: '9pt', color: MUTED }}>Map unavailable</span>
              )}
            </div>
            <div style={{ fontSize: '7pt', color: MUTED, margin: '1mm 0' }}>{brief.mapCaption}</div>
            <Legend active={activeLayers} />
            <div
              style={{
                marginTop: '2mm',
                padding: '1.5mm 3mm',
                background: '#fffbeb',
                borderLeft: `1.2mm solid ${AMBER}`,
                fontSize: '9pt',
                fontWeight: 800,
                color: '#78350f',
              }}
              data-testid="ref-brief-disclaimer"
            >
              {brief.disclaimer}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '2.5mm',
              padding: '3mm 10mm 0',
            }}
          >
            {brief.headline.map(item => (
              <div
                key={item.label}
                style={{
                  border: '0.3mm solid #bfdbfe',
                  borderTop: `1mm solid ${BLUE}`,
                  padding: '1.5mm 2.5mm',
                  background: '#f8fafc',
                }}
              >
                <div
                  style={{
                    fontSize: '6.5pt',
                    fontWeight: 700,
                    color: MUTED,
                    textTransform: 'uppercase',
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: '15pt', fontWeight: 800, color: NAVY }}>{item.value}</div>
              </div>
            ))}
          </div>

          {brief.priorities.show && (
            <div style={{ padding: '3mm 10mm 0' }} data-testid="ref-brief-priorities">
              <div
                style={{
                  fontSize: '8.5pt',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: NAVY,
                  borderBottom: `0.5mm solid ${AMBER}`,
                  paddingBottom: '1mm',
                }}
              >
                {brief.priorities.heading}
                <span style={{ fontWeight: 600, color: MUTED, marginLeft: '3mm' }}>
                  {brief.priorities.summary}
                </span>
              </div>
              <div style={{ fontSize: '6.5pt', color: MUTED, margin: '0.8mm 0' }}>
                {brief.priorities.preliminary} {brief.priorities.thresholds}.
              </div>
              {brief.priorities.unverified && (
                <div
                  style={{
                    fontSize: '7pt',
                    fontWeight: 700,
                    color: '#78350f',
                    marginBottom: '0.8mm',
                  }}
                >
                  {brief.priorities.unverified}
                </div>
              )}
              {brief.priorities.rows.map((row, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '2mm',
                    fontSize: '8pt',
                    padding: '0.5mm 0',
                  }}
                >
                  <span
                    style={{
                      minWidth: '13mm',
                      textAlign: 'center',
                      fontWeight: 800,
                      fontSize: '7pt',
                      padding: '0.3mm 1mm',
                      background: LEVEL_STYLE[row.level].bg,
                      color: LEVEL_STYLE[row.level].fg,
                    }}
                  >
                    {LEVEL_WORD[row.level]}
                  </span>
                  <span>{row.text}</span>
                </div>
              ))}
              {brief.priorities.overflow && (
                <div style={{ fontSize: '7pt', color: MUTED }}>{brief.priorities.overflow}</div>
              )}
            </div>
          )}

          <div style={{ padding: '2.5mm 10mm 0', fontSize: '8.5pt', fontWeight: 700, color: NAVY }}>
            Operational note: {brief.operationalNote}
          </div>
          <Footer brief={brief} page={1} />
        </div>

        {/* ───────── Page 2: operational detail ───────── */}
        <div style={PAGE} data-testid="ref-brief-page-2">
          <div
            style={{
              background: NAVY,
              color: '#ffffff',
              padding: '4mm 10mm',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: '10pt' }}>{brief.heading}</span>
            <span style={{ fontSize: '8pt', color: AMBER, fontWeight: 700 }}>{brief.kicker}</span>
          </div>
          <div
            style={{
              background: fresh.bg,
              color: fresh.fg,
              padding: '1.5mm 10mm',
              fontSize: '8pt',
              fontWeight: 800,
            }}
          >
            {brief.freshness.text}
          </div>

          <div style={{ padding: '5mm 10mm 0' }}>
            <Table table={brief.areaTable} />
            <Table table={brief.windTable} />

            {brief.priorities.otherRed && (
              <div style={{ marginBottom: '5mm' }} data-testid="ref-brief-other-red">
                <div
                  style={{
                    fontSize: '8.5pt',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    color: NAVY,
                    borderBottom: `0.5mm solid ${AMBER}`,
                    paddingBottom: '1mm',
                    marginBottom: '1.5mm',
                  }}
                >
                  {brief.priorities.otherRed.heading}
                  <span style={{ fontWeight: 600, color: MUTED, marginLeft: '3mm' }}>
                    {brief.priorities.preliminary}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '7.5pt',
                    lineHeight: 1.6,
                    maxHeight: '13mm',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 3,
                  }}
                >
                  <span
                    style={{
                      background: PRIORITY_COLORS.red,
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '6.5pt',
                      padding: '0.3mm 1mm',
                      marginRight: '1.5mm',
                    }}
                  >
                    RED
                  </span>
                  {brief.priorities.otherRed.text}
                </div>
              </div>
            )}

            <div
              style={{
                fontSize: '8.5pt',
                fontWeight: 800,
                letterSpacing: '0.04em',
                color: NAVY,
                borderBottom: `0.5mm solid ${AMBER}`,
                paddingBottom: '1mm',
                marginBottom: '2mm',
              }}
            >
              DATA AND DECISION CONTEXT
            </div>
            <div style={{ display: 'flex', gap: '6mm', alignItems: 'flex-start' }}>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '4mm',
                  fontSize: '8pt',
                  lineHeight: 1.55,
                  flex: 1,
                }}
              >
                {brief.context.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {qrCodeSrc && (
                <div style={{ textAlign: 'center', width: '32mm', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeSrc}
                    alt="QR code to the live dashboard"
                    style={{ width: '30mm', height: '30mm' }}
                  />
                  <div style={{ fontSize: '6.5pt', color: MUTED }}>
                    Live dashboard for this forecast
                  </div>
                </div>
              )}
            </div>
          </div>
          <Footer brief={brief} page={2} />
        </div>
      </div>
    );
  }
);
REFPDFTemplate.displayName = 'REFPDFTemplate';

export default REFPDFTemplate;
