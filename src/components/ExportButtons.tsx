'use client';

import { useRef, useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { Event, ExposureData, EconomicDamageData, Hazard, Sector } from '@/types';

// OCHA colour palette (RGB tuples)
const OCHA_BLUE: [number, number, number] = [0, 124, 224];
const OCHA_DARK: [number, number, number] = [2, 64, 116];
const OCHA_ORANGE: [number, number, number] = [243, 154, 34];
const TEXT_DARK: [number, number, number] = [47, 47, 47];
const TEXT_MED: [number, number, number] = [110, 110, 110];
const STRIPE: [number, number, number] = [240, 246, 252];

// A4 page geometry (mm)
const PW = 210;
const PH = 297;
const MX = 12; // horizontal margin
const CONTENT_W = PW - 2 * MX; // 186 mm

// Sector table column right-edge x-positions (mm from left page edge)
// Widths: [Sector 44, Exposed 34, Damaged 34, Bldg Loss 42, Total Loss 32] = 186
const TCOL_X = [MX, MX + 44, MX + 78, MX + 112, MX + 154, MX + 186];
const TCOL_WIDTHS = [44, 34, 34, 42, 32];

const FOOTER_H = 9;
const CONTENT_TOP = 15;
const CONTENT_BOTTOM = PH - FOOTER_H - 4;
const MAP_MAX_DIMENSION_PX = 2200;
const MAP_CAPTURE_TIMEOUT_MS = 1500;

/** Minimal map type — avoids importing all of maplibre-gl into this module */
type MapLike = {
  getCanvas: () => HTMLCanvasElement;
  once?: (event: string, callback: () => void) => void;
  triggerRepaint?: () => void;
} | null;

interface ExportButtonsProps {
  events: Event[];
  exposureData: ExposureData[];
  economicDamageData: EconomicDamageData[];
  hazards: Hazard[];
  sectors: Sector[];
  disabled?: boolean;
  // OCHA SitRep enrichment
  countryName?: string;
  fullCountryName?: string;
  countryCode?: string;
  cycloneEventName?: string;
  impactBySector?: any[];
  nationalSummary?: any[];
  mapInstance?: MapLike;
  reportLocale?: string;
  includeMapInPdf?: boolean;
}

export default function ExportButtons({
  events,
  exposureData,
  economicDamageData,
  hazards,
  sectors,
  disabled = false,
  countryName = 'Pacific Island Country',
  fullCountryName,
  countryCode = '',
  cycloneEventName,
  impactBySector = [],
  nationalSummary = [],
  mapInstance = null,
  reportLocale,
  includeMapInPdf = true,
}: ExportButtonsProps) {
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const pdfExportInFlightRef = useRef(false);
  const csvExportInFlightRef = useRef(false);

  const locale =
    reportLocale ||
    (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-GB');
  const integerFormatter = new Intl.NumberFormat(locale);
  const compactCurrencyFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const fullCurrencyFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  const getHazardName = (hazardId: string) =>
    hazards.find(h => h.id === hazardId)?.name || hazardId;

  const getSectorName = (sectorId: string) =>
    sectors.find(s => s.id === sectorId)?.name || sectorId;

  const formatInteger = (value: number) => integerFormatter.format(value);

  const formatCompactUsd = (value: number) => compactCurrencyFormatter.format(value);

  const formatUsd = (value: number) => fullCurrencyFormatter.format(value);

  const sanitizeFilenamePart = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9_-]/g, '')
      .replace(/-+/g, '-');

  const waitForMapRender = async (map: MapLike) => {
    if (!map) return;

    map.triggerRepaint?.();

    await new Promise<void>(resolve => {
      if (!map.once) {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        return;
      }

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };

      try {
        map.once('idle', finish);
      } catch {
        // If event hooks are unavailable, fall back to frame sync.
      }

      setTimeout(finish, MAP_CAPTURE_TIMEOUT_MS);
    });
  };

  const captureMapCanvas = async (map: MapLike): Promise<HTMLCanvasElement | null> => {
    if (!map) return null;

    await waitForMapRender(map);
    const sourceCanvas = map.getCanvas();

    if (!sourceCanvas?.width || !sourceCanvas?.height) return null;

    const maxSide = Math.max(sourceCanvas.width, sourceCanvas.height);
    const scale = Math.min(2, MAP_MAX_DIMENSION_PX / maxSide);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    exportCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return sourceCanvas;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, exportCanvas.width, exportCanvas.height);

    return exportCanvas;
  };

  // ─── OCHA SitRep PDF ────────────────────────────────────────────────────────
  const downloadPDF = async () => {
    if (disabled) {
      setExportError('No data available to export');
      setTimeout(() => setExportError(null), 3000);
      return;
    }
    if (pdfExportInFlightRef.current) return;

    pdfExportInFlightRef.current = true;
    setIsExportingPDF(true);

    try {
      setExportError(null);
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const cFull = fullCountryName || countryName;
      const eventName = cycloneEventName || events[0]?.name || 'Tropical Cyclone Assessment';
      const reportDate = new Date().toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      doc.setProperties({
        title: `PDIE Situation Report - ${cFull}`,
        subject: eventName,
        author: 'SPC / OCHA Pacific',
        creator: 'PDIE Dashboard',
        keywords: 'PDIE, disaster, exposure, impact, sitrep',
      });

      // ── Capture map snapshot ──────────────────────────────────────────────
      let mapCanvas: HTMLCanvasElement | null = null;
      if (includeMapInPdf && mapInstance) {
        try {
          mapCanvas = await captureMapCanvas(mapInstance);
        } catch (error) {
          console.warn('Map capture skipped for PDF export:', error);
        }
      }

      // ── Derive summary figures from nationalSummary CSV ───────────────────
      const ns: Record<string, string> = nationalSummary?.[0] ?? {};
      const sectorTotalsById = new Map<
        string,
        {
          exposedBuildings: number;
          damagedBuildings: number;
          directLoss: number;
          totalLoss: number;
        }
      >();

      exposureData.forEach(exp => {
        const existing = sectorTotalsById.get(exp.sectorId) ?? {
          exposedBuildings: 0,
          damagedBuildings: 0,
          directLoss: 0,
          totalLoss: 0,
        };
        existing.exposedBuildings += exp.buildingCount || 0;
        sectorTotalsById.set(exp.sectorId, existing);
      });

      economicDamageData.forEach(damage => {
        const existing = sectorTotalsById.get(damage.sectorId) ?? {
          exposedBuildings: 0,
          damagedBuildings: 0,
          directLoss: 0,
          totalLoss: 0,
        };
        existing.directLoss += damage.directLoss || 0;
        existing.totalLoss += damage.totalLoss || 0;
        sectorTotalsById.set(damage.sectorId, existing);
      });

      const derivedSectorRows = Array.from(sectorTotalsById.entries())
        .map(([sectorId, totals]) => ({
          Sector: getSectorName(sectorId),
          Number_Exposed_Buildings: totals.exposedBuildings,
          Number_Damaged_Buildings: totals.damagedBuildings,
          Building_Loss: totals.directLoss,
          Total_Loss: totals.totalLoss,
        }))
        .sort((a, b) => Number(b.Total_Loss || 0) - Number(a.Total_Loss || 0));

      const sectorRows = derivedSectorRows.length > 0 ? derivedSectorRows : (impactBySector ?? []);

      const totalAffectedFromEvents = events.reduce(
        (sum, event) => sum + (event.totalAffectedPopulation || 0),
        0
      );
      const totalLossFromEconomic = economicDamageData.reduce(
        (sum, damage) => sum + (damage.totalLoss || 0),
        0
      );
      const totalLossFromEvents = events.reduce(
        (sum, event) => sum + (event.totalEconomicDamage || 0),
        0
      );
      const exposedBuildingsFromExposure = exposureData.reduce(
        (sum, exposure) => sum + (exposure.buildingCount || 0),
        0
      );
      const exposedBuildingsFromSectorRows = sectorRows.reduce(
        (sum, row: Record<string, string | number>) =>
          sum + (Number(row.Number_Exposed_Buildings) || 0),
        0
      );
      const damagedBuildingsFromSectorRows = sectorRows.reduce(
        (sum, row: Record<string, string | number>) =>
          sum + (Number(row.Number_Damaged_Buildings) || 0),
        0
      );

      const totalAffectedPop =
        totalAffectedFromEvents || Number(ns.Population_Exposed_To_Any_Hazard) || 0;
      const damagedBuildings = damagedBuildingsFromSectorRows || Number(ns.Damaged_Buildings) || 0;
      const exposedBuildings =
        exposedBuildingsFromSectorRows ||
        exposedBuildingsFromExposure ||
        Number(ns.Buildings_Exposed_To_Any_Hazard) ||
        0;
      const totalLoss = totalLossFromEconomic || totalLossFromEvents || Number(ns.Total_Loss) || 0;
      const evacuationCentres = Number(ns.Total_Evacuation_Centres) || 0;
      const schoolsExposed = Number(ns.Exposed_Schools) || 0;
      const maxWindKmph = Number(ns.Max_Wind_Gusts) || 0;

      // ── Helper: draw footer on every page ────────────────────────────────
      const drawFooter = (page: number, total: number) => {
        doc.setPage(page);
        doc.setFillColor(...OCHA_BLUE);
        doc.rect(0, PH - FOOTER_H, PW, FOOTER_H, 'F');
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(255, 255, 255);
        doc.text(`Page ${page} of ${total}`, MX, PH - 3);
        doc.text(
          'Pacific Disaster Impact & Exposure (PDIE) Dashboard  |  SPC / OCHA Pacific',
          PW / 2,
          PH - 3,
          { align: 'center' }
        );
        doc.text(reportDate, PW - MX, PH - 3, { align: 'right' });
      };

      // ════════════════════════════════════════════════════════════════════
      //  PAGE 1
      // ════════════════════════════════════════════════════════════════════

      // ── Header band ───────────────────────────────────────────────────────
      doc.setFillColor(...OCHA_BLUE);
      doc.rect(0, 0, PW, 40, 'F');

      // Accent bar
      doc.setFillColor(...OCHA_ORANGE);
      doc.rect(0, 34, PW, 3, 'F');

      doc.setTextColor(255, 255, 255);

      // "SITUATION REPORT" label
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('SITUATION REPORT', MX, 10);

      // Report number / date (right)
      doc.setFont('helvetica', 'normal');
      doc.text(`No. 01  |  ${reportDate}`, PW - MX, 10, { align: 'right' });

      // Event name (wrap to keep title block consistent with SVG template)
      const RIGHT_BRAND_W = 62;
      const leftHeaderW = CONTENT_W - RIGHT_BRAND_W - 6;
      doc.setFontSize(17);
      doc.setFont('helvetica', 'bold');
      const eventLines = doc.splitTextToSize(eventName, leftHeaderW).slice(0, 2);
      doc.text(eventLines, MX, 20);

      // Country full name
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      const countryY = 20 + eventLines.length * 6 + 1;
      doc.text(cFull, MX, countryY);

      // Divider between left title content and right branding
      const dividerX = PW - MX - RIGHT_BRAND_W - 3;
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.line(dividerX, 14, dividerX, 32.5);

      // Branding right
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      const brandLines = doc.splitTextToSize(
        'Pacific Disaster Impact & Exposure | PDIE Dashboard',
        RIGHT_BRAND_W
      );
      doc.text(brandLines, PW - MX, 20, { align: 'right' });

      // Start content after header irrespective of wrapped text length.
      let y = Math.max(49, countryY + 16);
      const ensureSpace = (requiredHeight: number) => {
        if (y + requiredHeight <= CONTENT_BOTTOM) return;
        doc.addPage();
        y = CONTENT_TOP;
      };

      // ── KEY FIGURES ───────────────────────────────────────────────────────
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEXT_DARK);
      doc.text('KEY FIGURES', MX, y);
      y += 4;

      const figures: Array<{ label: string; value: string }> = [
        {
          label: 'People Affected',
          value: totalAffectedPop > 0 ? formatInteger(totalAffectedPop) : 'N/A',
        },
        {
          label: 'Buildings Damaged',
          value: damagedBuildings > 0 ? formatInteger(damagedBuildings) : 'N/A',
        },
        {
          label: 'Buildings Exposed',
          value: exposedBuildings > 0 ? formatInteger(exposedBuildings) : 'N/A',
        },
        {
          label: 'Total Economic Loss',
          value: totalLoss > 0 ? formatCompactUsd(totalLoss) : 'N/A',
        },
        {
          label: 'Evacuation Centres',
          value: evacuationCentres > 0 ? evacuationCentres.toString() : 'N/A',
        },
        {
          label: maxWindKmph > 0 ? 'Max Wind (km/h)' : 'Schools Exposed',
          value:
            maxWindKmph > 0
              ? maxWindKmph.toFixed(0)
              : schoolsExposed > 0
                ? schoolsExposed.toString()
                : 'N/A',
        },
      ];

      const BOX_COLS = 3;
      const BOX_GAP = 4;
      const BOX_W = (CONTENT_W - (BOX_COLS - 1) * BOX_GAP) / BOX_COLS; // ≈ 59.3 mm
      const BOX_H = 20;

      figures.forEach((fig, i) => {
        const col = i % BOX_COLS;
        const row = Math.floor(i / BOX_COLS);
        const bx = MX + col * (BOX_W + BOX_GAP);
        const by = y + row * (BOX_H + 3);

        doc.setFillColor(...STRIPE);
        doc.roundedRect(bx, by, BOX_W, BOX_H, 2, 2, 'F');

        doc.setFillColor(...OCHA_ORANGE);
        doc.rect(bx, by, 3, BOX_H, 'F');

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...OCHA_DARK);
        doc.text(fig.value, bx + BOX_W / 2 + 1.5, by + BOX_H * 0.55, { align: 'center' });

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TEXT_MED);
        doc.text(fig.label.toUpperCase(), bx + BOX_W / 2 + 1.5, by + BOX_H * 0.83, {
          align: 'center',
        });
      });
      y += 2 * (BOX_H + 3) + 4;

      // ── SITUATION OVERVIEW ────────────────────────────────────────────────
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEXT_DARK);
      doc.text('SITUATION OVERVIEW', MX, y);
      y += 3;
      doc.setDrawColor(...OCHA_BLUE);
      doc.setLineWidth(0.5);
      doc.line(MX, y, PW - MX, y);
      y += 5;

      const narrative =
        `${eventName} impacted ${cFull}, resulting in widespread damage across multiple sectors. ` +
        (totalAffectedPop > 0
          ? `Approximately ${formatInteger(totalAffectedPop)} people were exposed to hazard impacts. `
          : '') +
        (damagedBuildings > 0
          ? `${formatInteger(damagedBuildings)} buildings were damaged out of ${formatInteger(exposedBuildings)} in the exposed area. `
          : '') +
        (totalLoss > 0
          ? `Total estimated economic losses amount to ${formatUsd(totalLoss)}. `
          : '') +
        `This Situation Report was generated from the PDIE (Pacific Disaster Impact & Exposure) ` +
        `Dashboard using satellite-derived and modelled hazard and exposure data provided by SPC.`;

      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...TEXT_DARK);
      const narLines = doc.splitTextToSize(narrative, CONTENT_W);
      doc.text(narLines, MX, y);
      y += narLines.length * 4.8 + 7;

      // ── SECTOR ANALYSIS TABLE ─────────────────────────────────────────────
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEXT_DARK);
      doc.text('SECTOR ANALYSIS', MX, y);
      y += 3;
      doc.setDrawColor(...OCHA_BLUE);
      doc.setLineWidth(0.5);
      doc.line(MX, y, PW - MX, y);
      y += 5;

      const ROW_H = 7;
      const THEAD_H = 7;
      const drawSectorTableHeader = () => {
        doc.setFillColor(...OCHA_BLUE);
        doc.rect(MX, y - THEAD_H + 1.5, CONTENT_W, THEAD_H, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);

        const tHeaders = [
          'Sector',
          'Exposed Bldgs',
          'Damaged Bldgs',
          'Building Loss (USD)',
          'Total Loss (USD)',
        ];
        tHeaders.forEach((h, i) => {
          if (i === 0) {
            doc.text(h, TCOL_X[0] + 2, y);
          } else {
            doc.text(h, TCOL_X[i + 1] - 2, y, { align: 'right' });
          }
        });
        y += THEAD_H - 1;
      };

      // Table header row
      drawSectorTableHeader();

      let totalSectorLoss = 0;

      sectorRows.forEach((row: Record<string, string>, idx: number) => {
        const sLoss = Number(row.Total_Loss) || 0;
        totalSectorLoss += sLoss;

        if (y + ROW_H + 2 > CONTENT_BOTTOM) {
          doc.addPage();
          y = CONTENT_TOP;
          drawSectorTableHeader();
        }

        if (idx % 2 === 0) {
          doc.setFillColor(...STRIPE);
          doc.rect(MX, y - ROW_H + 2, CONTENT_W, ROW_H, 'F');
        }

        doc.setFontSize(7.5);
        doc.setFont('helvetica', idx % 2 === 0 ? 'normal' : 'normal');
        doc.setTextColor(...TEXT_DARK);

        const cells = [
          row.Sector || '—',
          formatInteger(Number(row.Number_Exposed_Buildings || 0)),
          formatInteger(Number(row.Number_Damaged_Buildings || 0)),
          formatUsd(Number(row.Building_Loss) || 0),
          formatUsd(sLoss),
        ];
        cells.forEach((cell, i) => {
          if (i === 0) {
            doc.text(cell, TCOL_X[0] + 2, y);
          } else {
            doc.text(cell, TCOL_X[i + 1] - 2, y, { align: 'right' });
          }
        });
        y += ROW_H;
      });

      // Total row
      if (sectorRows.length > 0) {
        if (y + ROW_H + 4 > CONTENT_BOTTOM) {
          doc.addPage();
          y = CONTENT_TOP;
          drawSectorTableHeader();
        }
        doc.setFillColor(...OCHA_DARK);
        doc.rect(MX, y - ROW_H + 2, CONTENT_W, ROW_H, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('TOTAL', TCOL_X[0] + 2, y);
        doc.text(formatUsd(totalSectorLoss), TCOL_X[5] - 2, y, {
          align: 'right',
        });
        y += ROW_H + 4;
      }

      // Data source note
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...TEXT_MED);
      doc.text(
        'Source: PDIE Dashboard / SPC. Loss values shown in USD. Data derived from hazard modelling.',
        MX,
        y
      );
      y += 8;

      // ── MAP IMAGE ─────────────────────────────────────────────────────────
      if (mapCanvas) {
        const mapH = 72;
        ensureSpace(mapH + 20);
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TEXT_DARK);
        doc.text('HAZARD IMPACT MAP', MX, y);
        y += 3;
        doc.setDrawColor(...OCHA_BLUE);
        doc.setLineWidth(0.5);
        doc.line(MX, y, PW - MX, y);
        y += 4;
        doc.addImage(mapCanvas, 'PNG', MX, y, CONTENT_W, mapH, undefined, 'FAST');
        y += mapH + 3;
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(...TEXT_MED);
        doc.text('Fig. 1: PDIE Dashboard map — hazard and impact layer snapshot.', MX, y);
      }

      // ── Footer on all pages ───────────────────────────────────────────────
      const pageCount = doc.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) drawFooter(p, pageCount);

      const safeCountryName = sanitizeFilenamePart(countryName || 'country');
      const isoDate = new Date().toISOString().split('T')[0];
      const filename = `PDIE-SitRep-${safeCountryName}-${isoDate}.pdf`;
      doc.save(filename);
    } catch (error) {
      console.error('PDF export failed:', error);
      setExportError('Failed to export PDF. Please try again.');
      setTimeout(() => setExportError(null), 5000);
    } finally {
      pdfExportInFlightRef.current = false;
      setIsExportingPDF(false);
    }
  };

  const toCsvCell = (value: unknown): string => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const downloadCSV = async () => {
    if (disabled) {
      setExportError('No data available to export');
      setTimeout(() => setExportError(null), 3000);
      return;
    }
    if (csvExportInFlightRef.current) return;
    csvExportInFlightRef.current = true;
    setIsExportingCSV(true);
    try {
      setExportError(null);
      const { saveAs } = await import('file-saver');

      const rows: string[][] = [
        [
          'dataset',
          'event_name',
          'event_date',
          'hazard',
          'sector',
          'severity',
          'affected_population',
          'economic_damage_usd',
          'latitude',
          'longitude',
          'assets_at_risk_usd',
          'infrastructure_units',
          'direct_loss_usd',
          'indirect_loss_usd',
          'total_loss_usd',
          'year',
        ],
      ];

      events.forEach(event => {
        rows.push(
          [
            'event',
            event.name,
            event.date,
            getHazardName(event.hazardId),
            '',
            event.severity,
            event.totalAffectedPopulation || 0,
            event.totalEconomicDamage || 0,
            event.location.lat,
            event.location.lng,
            '',
            '',
            '',
            '',
            '',
            '',
          ].map(value => String(value))
        );
      });

      exposureData.forEach(exp => {
        rows.push(
          [
            'exposure',
            '',
            '',
            getHazardName(exp.hazardId),
            getSectorName(exp.sectorId),
            '',
            exp.population,
            '',
            '',
            '',
            exp.assets,
            exp.infrastructure,
            '',
            '',
            '',
            '',
          ].map(value => String(value))
        );
      });

      economicDamageData.forEach(damage => {
        rows.push(
          [
            'economic_damage',
            '',
            '',
            getHazardName(damage.hazardId),
            getSectorName(damage.sectorId),
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            damage.directLoss,
            damage.indirectLoss,
            damage.totalLoss,
            damage.year,
          ].map(value => String(value))
        );
      });

      const csvContent = rows.map(row => row.map(cell => toCsvCell(cell)).join(',')).join('\n');

      const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8',
      });
      saveAs(blob, 'climate-risk-data.csv');
    } catch (error) {
      console.error('CSV export failed:', error);
      setExportError('Failed to export CSV. Please try again.');
      setTimeout(() => setExportError(null), 5000);
    } finally {
      csvExportInFlightRef.current = false;
      setIsExportingCSV(false);
    }
  };

  return (
    <div className="flex gap-1.5 sm:gap-2 items-center flex-shrink-0">
      {exportError && (
        <span className="text-xs sm:text-sm text-red-600 dark:text-red-400 hidden lg:block">
          {exportError}
        </span>
      )}
      <button
        onClick={downloadPDF}
        disabled={disabled || isExportingPDF}
        aria-label="Export data as PDF report"
        className={`group inline-flex items-center gap-2 px-3.5 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white rounded-xl border transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
          disabled
            ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed opacity-60'
            : 'bg-gradient-to-br from-red-500/90 to-rose-600/90 border-red-400/30 shadow-[0_12px_28px_-14px_rgba(239,68,68,0.9)] hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-16px_rgba(239,68,68,1)] hover:border-red-300/60 focus-visible:ring-red-300/70'
        }`}
        title={disabled ? 'No data available to export' : 'Export as PDF'}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 border border-white/20 group-hover:bg-white/20 transition-colors">
          <FileDown className="w-3.5 h-3.5" />
        </span>
        <span className="hidden sm:inline">{isExportingPDF ? 'Exporting' : 'Export'}</span> PDF
      </button>
      <button
        onClick={downloadCSV}
        disabled={disabled || isExportingCSV}
        aria-label="Export data as CSV file"
        className={`group inline-flex items-center gap-2 px-3.5 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white rounded-xl border transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
          disabled
            ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed opacity-60'
            : 'bg-gradient-to-br from-emerald-500/90 to-teal-600/90 border-emerald-300/30 shadow-[0_12px_28px_-14px_rgba(16,185,129,0.9)] hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-16px_rgba(16,185,129,1)] hover:border-emerald-200/60 focus-visible:ring-emerald-300/70'
        }`}
        title={disabled ? 'No data available to export' : 'Export as CSV'}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 border border-white/20 group-hover:bg-white/20 transition-colors">
          <FileSpreadsheet className="w-3.5 h-3.5" />
        </span>
        <span className="hidden sm:inline">{isExportingCSV ? 'Exporting' : 'Export'}</span> CSV
      </button>
    </div>
  );
}
