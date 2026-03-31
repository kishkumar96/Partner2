'use client';

import { useRef, useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { Event, ExposureData, EconomicDamageData, Hazard, Sector } from '@/types';
import QRCode from 'qrcode';
import { getCountrySlugFromCode } from '@/utils/countrySlug';

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

// Sector table column boundary x-positions (mm from left page edge)
// Widths: [Sector 44, Exposed 34, Damaged 34, Bldg Loss 42, Total Loss 32] = 186
const TCOL_X = [MX, MX + 44, MX + 78, MX + 112, MX + 154, MX + 186];

const FOOTER_H = 9;
const CONTENT_TOP = 15;
const CONTENT_BOTTOM = PH - FOOTER_H - 4;
const TEMPLATE_PAGE1_CONTENT_TOP = 154;
const TEMPLATE_CONTINUATION_CONTENT_TOP = 34;
const TEMPLATE_PAGE1_MAP_SLOT = { x: 0, y: 47, w: 210, h: 96 } as const;
const TEMPLATE_PAGE1_HEADER_RULE = { maskY: 22, lineY: 31 } as const;
const TEMPLATE_PAGE1_QR_SLOT = { x: 177, y: 273, size: 20 } as const;
const TEMPLATE_KEY_FIGURE_BOXES = [
  { x: 24.7, y: 172.25, w: 45.3, h: 14.81 },
  { x: 82.2, y: 172.25, w: 45.6, h: 14.81 },
  { x: 143.84, y: 172.25, w: 41.16, h: 14.81 },
  { x: 24.7, y: 205.48, w: 45.3, h: 14.81 },
  { x: 82.2, y: 205.48, w: 45.6, h: 14.81 },
  { x: 143.84, y: 205.48, w: 41.16, h: 14.81 },
] as const;
const MAP_MAX_DIMENSION_PX = 2200;
const MAP_CAPTURE_TIMEOUT_MS = 1500;
const ASSET_FETCH_TIMEOUT_MS = 3000; // Increased for reliable template loading

/** Minimal map type — avoids importing all of maplibre-gl into this module */
type MapLike = {
  getCanvas: () => HTMLCanvasElement;
  once?: (event: string, callback: () => void) => void;
  triggerRepaint?: () => void;
} | null;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> => {
  return await Promise.race([
    promise,
    new Promise<undefined>(resolve => {
      setTimeout(() => resolve(undefined), timeoutMs);
    }),
  ]);
};

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

  const fetchAssetDataUrl = async (
    path: string,
    options?:
      | number
      | {
          rasterizeWidthPx?: number;
          targetHeightPx?: number;
          fit?: 'contain' | 'cover';
          cropAnchorY?: 'top' | 'center';
        }
  ): Promise<string | undefined> => {
    try {
      const response = await fetch(path);
      if (!response.ok) return undefined;

      const isSvg = path.toLowerCase().endsWith('.svg');
      if (!isSvg) {
        const blob = await response.blob();
        return await new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }

      const svgText = await response.text();
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
      const objectUrl = URL.createObjectURL(svgBlob);

      try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Failed to load SVG asset: ${path}`));
          img.src = objectUrl;
        });

        const normalizedOptions =
          typeof options === 'number' ? { rasterizeWidthPx: options } : (options ?? {});
        const width = normalizedOptions.rasterizeWidthPx || image.naturalWidth || 1600;
        const aspectRatio =
          image.naturalWidth && image.naturalHeight
            ? image.naturalHeight / image.naturalWidth
            : 0.714;
        const naturalHeight = Math.max(1, Math.round(width * aspectRatio));
        const height = Math.max(1, normalizedOptions.targetHeightPx || naturalHeight);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) return undefined;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';

        if (
          normalizedOptions.fit === 'cover' &&
          image.naturalWidth > 0 &&
          image.naturalHeight > 0
        ) {
          const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
          const drawWidth = image.naturalWidth * scale;
          const drawHeight = image.naturalHeight * scale;
          const dx = (width - drawWidth) / 2;
          const dy = normalizedOptions.cropAnchorY === 'top' ? 0 : (height - drawHeight) / 2;

          context.drawImage(image, dx, dy, drawWidth, drawHeight);
        } else {
          context.drawImage(image, 0, 0, width, height);
        }

        return canvas.toDataURL('image/png');
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      return undefined;
    }
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

      // Map country code to header image
      const countryHeaderMap: Record<string, string> = {
        VU: '/pdf-assets/Country headers/DashBoard_Header_Vanuatu.png',
        CK: '/pdf-assets/Country headers/DashBoard_Header_Cook Islands.png',
        TO: '/pdf-assets/Country headers/DashBoard_Header_Tonga.png',
        WS: '/pdf-assets/Country headers/DashBoard_Header_Samoa.png',
      };
      const countryFlagMap: Record<string, string> = {
        VU: '/pdf-assets/Country_Flags/Flag_of_Vanuatu.svg.png',
        CK: '/pdf-assets/Country_Flags/2000px-Flag_of_the_Cook_Islands.svg.png',
        TO: '/pdf-assets/Country_Flags/Flag_of_Tonga.svg.png',
        WS: '/pdf-assets/Country_Flags/Flag_of_Samoa.svg.png',
        FJ: '/pdf-assets/Country_Flags/Flag_of_Fiji.svg.png',
      };
      const countryHeaderPath = countryCode ? countryHeaderMap[countryCode] : undefined;
      const countryFlagPath = countryCode ? countryFlagMap[countryCode] : undefined;

      // Load all assets including icons, QR code, and country header
      const [
        headerBackdropSrc,
        templatePage1Src,
        templatePage2Src,
        countryHeaderSrc,
        countryFlagSrc,
        tableFooterBannerSrc,
        personIconSrc,
        buildingIconSrc,
      ] = await Promise.all([
        withTimeout(
          fetchAssetDataUrl('/pdf-assets/Topbackdrop.svg', {
            rasterizeWidthPx: 2400,
            targetHeightPx: 460,
            fit: 'cover',
            cropAnchorY: 'top',
          }),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl('/pdf-assets/PDF1_SVG1.svg', {
            rasterizeWidthPx: 2480,
            targetHeightPx: 3508,
            fit: 'cover',
            cropAnchorY: 'top',
          }),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl('/pdf-assets/PDF1_SVG2.svg', {
            rasterizeWidthPx: 2480,
            targetHeightPx: 3508,
            fit: 'cover',
            cropAnchorY: 'top',
          }),
          ASSET_FETCH_TIMEOUT_MS
        ),
        // Load country header if available
        countryHeaderPath
          ? withTimeout(fetchAssetDataUrl(countryHeaderPath), ASSET_FETCH_TIMEOUT_MS)
          : Promise.resolve(undefined),
        countryFlagPath
          ? withTimeout(fetchAssetDataUrl(countryFlagPath), ASSET_FETCH_TIMEOUT_MS)
          : Promise.resolve(undefined),
        withTimeout(
          fetchAssetDataUrl('/pdf-assets/DashBoard_Header_Country3.png'),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(fetchAssetDataUrl('/pdf-assets/icons/person.png'), ASSET_FETCH_TIMEOUT_MS),
        withTimeout(
          fetchAssetDataUrl('/pdf-assets/icons/house.svg', { rasterizeWidthPx: 128 }),
          ASSET_FETCH_TIMEOUT_MS
        ),
      ]);
      const useTemplateBackground = Boolean(templatePage1Src && templatePage2Src);

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

      // Footer removed for PDF export.
      const drawFooter = (_page: number, _total: number) => {};

      // ════════════════════════════════════════════════════════════════════
      //  PAGE 1
      // ════════════════════════════════════════════════════════════════════

      let currentPage = 1;
      const drawTemplateBackground = (pageNumber: number) => {
        if (!useTemplateBackground) return;
        const templateSrc = pageNumber === 1 ? templatePage1Src : templatePage2Src;
        if (!templateSrc) return;
        doc.addImage(templateSrc, 'PNG', 0, 0, PW, PH, undefined, 'FAST');
      };

      const addReportPage = () => {
        doc.addPage();
        currentPage += 1;
        drawTemplateBackground(currentPage);
        return useTemplateBackground ? TEMPLATE_CONTINUATION_CONTENT_TOP : CONTENT_TOP;
      };

      drawTemplateBackground(currentPage);

      if (useTemplateBackground) {
        doc.setFillColor(236, 248, 252);
        doc.rect(
          0,
          TEMPLATE_PAGE1_HEADER_RULE.maskY,
          PW,
          TEMPLATE_PAGE1_MAP_SLOT.y - TEMPLATE_PAGE1_HEADER_RULE.maskY,
          'F'
        );
        doc.setDrawColor(...OCHA_BLUE);
        doc.setLineWidth(0.9);
        doc.line(0, TEMPLATE_PAGE1_HEADER_RULE.lineY, PW, TEMPLATE_PAGE1_HEADER_RULE.lineY);
      }

      if (useTemplateBackground && mapCanvas) {
        const { x, y, w, h } = TEMPLATE_PAGE1_MAP_SLOT;
        doc.setFillColor(223, 228, 231);
        doc.rect(x, y, w, h, 'F');
        const sourceW = mapCanvas.width;
        const sourceH = mapCanvas.height;
        const widthRatio = w / sourceW;
        const heightRatio = h / sourceH;
        const scale = Math.min(widthRatio, heightRatio);
        const drawW = sourceW * scale;
        const drawH = sourceH * scale;
        const drawX = x + (w - drawW) / 2;
        const drawY = y + (h - drawH) / 2;
        doc.addImage(mapCanvas, 'PNG', drawX, drawY, drawW, drawH, undefined, 'FAST');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...OCHA_BLUE);
        doc.text(
          'Fig. 1: PDIE Dashboard map — hazard and impact layer snapshot.',
          PW / 2,
          y + h + 3,
          { align: 'center' }
        );
      }

      // Only draw header elements if NOT using template background
      if (!useTemplateBackground) {
        // ── Header band ─────────────────────────────────────────────────────
        if (headerBackdropSrc) {
          doc.addImage(headerBackdropSrc, 'PNG', 0, 0, PW, 40, undefined, 'FAST');
        } else {
          doc.setFillColor(...OCHA_BLUE);
          doc.rect(0, 0, PW, 40, 'F');

          // Accent bar
          doc.setFillColor(...OCHA_ORANGE);
          doc.rect(0, 34, PW, 3, 'F');
        }

        doc.setTextColor(255, 255, 255);

        // "SITUATION REPORT" label
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('SITUATION REPORT', MX, 10);

        // Report number / date (right)
        doc.setFont('helvetica', 'normal');
        doc.text(`No. 01  |  ${reportDate}`, PW - MX, 10, { align: 'right' });

        // Country full name
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.text(cFull, MX, 31);

        // Branding right
        doc.setFontSize(7.5);
        doc.text('Pacific Disaster Impact & Exposure  |  PDIE Dashboard', PW - MX, 31, {
          align: 'right',
        });
      } else {
        // When using template, add dynamic text overlays
        doc.setTextColor(...OCHA_DARK);

        // Country header at the top of the page (above map slot)
        if (countryHeaderSrc) {
          const headerWidth = PW; // Full page width (210mm for A4)
          const headerHeight = 30; // Fits above map slot (map starts at y=36)
          doc.addImage(countryHeaderSrc, 'PNG', 0, 0, headerWidth, headerHeight, undefined, 'FAST');
        }

        doc.setFillColor(236, 248, 252);
        doc.rect(0, 26, PW, 10, 'F');
        doc.setDrawColor(...OCHA_BLUE);
        doc.setLineWidth(0.9);
        doc.line(0, TEMPLATE_PAGE1_HEADER_RULE.lineY, PW, TEMPLATE_PAGE1_HEADER_RULE.lineY);

        if (countryFlagSrc) {
          const flagX = 8;
          const flagY = 32;
          const flagW = 26;
          const flagH = 12;
          doc.addImage(countryFlagSrc, 'PNG', flagX, flagY, flagW, flagH, undefined, 'FAST');
        }

        // Report number / date
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text(`No. 01 | ${reportDate}`, PW - MX, 35, { align: 'right' });

        // Branding line
        doc.setFontSize(8.5);
        doc.text('Pacific Disaster Impact & Exposure | PDIE Dashboard', PW - MX, 40, {
          align: 'right',
        });
      }

      // Page 1 template needs a lower content anchor than continuation pages.
      let y = useTemplateBackground ? TEMPLATE_PAGE1_CONTENT_TOP : 49;
      const ensureSpace = (requiredHeight: number) => {
        if (y + requiredHeight <= CONTENT_BOTTOM) return;
        y = addReportPage();
      };

      // ── KEY FIGURES ───────────────────────────────────────────────────────
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...OCHA_BLUE);
      doc.text('KEY FIGURES', PW / 2, y, { align: 'center' });
      y += useTemplateBackground ? 10 : 8;

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
          label: 'Total Economic Damage',
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

      if (useTemplateBackground) {
        TEMPLATE_KEY_FIGURE_BOXES.forEach((box, i) => {
          const fig = figures[i];
          const iconMap = [
            personIconSrc,
            undefined,
            buildingIconSrc,
            undefined,
            undefined,
            undefined,
          ];
          const iconSrc = iconMap[i];
          const iconSize = 14;
          const iconY = box.y - 19;
          const valueY = box.y + 4.6; // Position value slightly higher for better centering
          const labelLines = doc.splitTextToSize(fig.label.toUpperCase(), box.w - 3);
          const labelLineHeight = 2.3;
          const labelStartY =
            box.y + box.h - 3.8 - labelLineHeight * Math.max(0, labelLines.length - 1);

          if (iconSrc) {
            doc.addImage(
              iconSrc,
              'PNG',
              box.x + box.w / 2 - iconSize / 2,
              iconY,
              iconSize,
              iconSize,
              undefined,
              'FAST'
            );
          }

          // Draw value (number)
          doc.setFontSize(15);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.text(fig.value, box.x + box.w / 2, valueY, { align: 'center' });

          // Draw label (description text)
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(255, 255, 255);
          doc.text(labelLines, box.x + box.w / 2, labelStartY, {
            align: 'center',
            baseline: 'top',
          });
        });

        y = Math.max(...TEMPLATE_KEY_FIGURE_BOXES.map(box => box.y + box.h)) + 22;
      } else {
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
      }

      // ── SITUATION OVERVIEW ────────────────────────────────────────────────
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...OCHA_BLUE);
      doc.text('SITUATION OVERVIEW', MX, y);
      y += 9;

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

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...OCHA_BLUE);
      const narLines = doc.splitTextToSize(narrative, CONTENT_W);
      doc.text(narLines, MX, y, { maxWidth: CONTENT_W });
      y += narLines.length * 6.2 + 8;

      // ── FORCE PAGE BREAK: Move table to page 2 ────────────────────────────
      y = addReportPage();

      // ── SECTOR ANALYSIS TABLE ─────────────────────────────────────────────
      // Only draw section header if not using template (template has it built-in)
      if (!useTemplateBackground) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...OCHA_BLUE);
        doc.text('SECTOR ANALYSIS', MX, y);
        y += 5;
      }

      const ROW_H = 8.5;
      const THEAD_H = 16;
      const TABLE_TITLE_SPACE = 18;
      const CELL_PAD_X = 2;
      const TABLE_X = MX;
      const TABLE_W = TCOL_X[5] - TCOL_X[0];
      const TABLE_RIGHT = TABLE_X + TABLE_W;
      const TABLE_BLUE: [number, number, number] = [0, 70, 173];
      const TABLE_FILL: [number, number, number] = [241, 248, 252];
      const TOTAL_FILL: [number, number, number] = [157, 211, 231];
      const TABLE_RULE: [number, number, number] = [98, 211, 241];
      const TABLE_TEXT: [number, number, number] = [0, 124, 224];
      const TABLE_BG: [number, number, number] = [255, 255, 255];
      const getRowsThatFit = (pageStartY: number, reserveTotalRow: boolean) => {
        const usableHeight = CONTENT_BOTTOM - (pageStartY + 2) - (reserveTotalRow ? ROW_H + 6 : 0);
        return Math.max(0, Math.floor(usableHeight / ROW_H));
      };
      const drawTableBackdrop = (rowsRemaining: number, forceTotalRow = false) => {
        const pageStartY = y;
        const rowsWithTotal = getRowsThatFit(pageStartY, true);
        const includeTotalRow = forceTotalRow || rowsRemaining <= rowsWithTotal;
        const rowsOnPage = Math.min(rowsRemaining, getRowsThatFit(pageStartY, includeTotalRow));
        const backdropTop = pageStartY - TABLE_TITLE_SPACE;
        const backdropHeight =
          TABLE_TITLE_SPACE + rowsOnPage * ROW_H + (includeTotalRow ? ROW_H : 0) + 7;

        doc.setFillColor(...TABLE_BG);
        doc.rect(TABLE_X - 1, backdropTop, TABLE_W + 2, backdropHeight, 'F');
      };
      const drawRowRule = (ruleY: number) => {
        doc.setDrawColor(...TABLE_RULE);
        doc.setLineWidth(0.35);
        doc.line(TABLE_X, ruleY, TABLE_RIGHT, ruleY);
      };
      const drawColumnRules = (topY: number, bottomY: number) => {
        doc.setDrawColor(...TABLE_RULE);
        doc.setLineWidth(0.35);
        TCOL_X.slice(1, -1).forEach(x => {
          doc.line(x, topY, x, bottomY);
        });
      };
      const drawSectorTableTitle = () => {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TABLE_BLUE);
        doc.text('SECTOR ANALYSIS', PW / 2, y - 14, { align: 'center' });
      };
      const drawSectorTableHeader = () => {
        const headerTop = y - THEAD_H + 3;
        const headerCenterY = headerTop + THEAD_H / 2;
        const headerLineHeight = 3.4;
        doc.setFillColor(...TABLE_BLUE);
        doc.rect(TABLE_X, headerTop, TABLE_W, THEAD_H, 'F');
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);

        const tHeaders = [
          ['Sector'],
          ['Exposed', 'Bldgs'],
          ['Damaged', 'Bldgs'],
          ['Building Loss', '(USD)'],
          ['Total Loss (USD)'],
        ];
        tHeaders.forEach((lines, i) => {
          const centerX = (TCOL_X[i] + TCOL_X[i + 1]) / 2;
          const startY = headerCenterY - ((lines.length - 1) * headerLineHeight) / 2;
          lines.forEach((line, lineIndex) => {
            doc.text(line, centerX, startY + lineIndex * headerLineHeight, {
              align: 'center',
              baseline: 'middle',
            });
          });
        });
        y = headerTop + THEAD_H + 3;
      };

      drawTableBackdrop(sectorRows.length);
      drawSectorTableTitle();
      drawSectorTableHeader();

      let totalSectorLoss = 0;

      sectorRows.forEach((row: Record<string, string>, idx: number) => {
        const sLoss = Number(row.Total_Loss) || 0;
        totalSectorLoss += sLoss;

        if (y + ROW_H + 2 > CONTENT_BOTTOM) {
          y = addReportPage();
          drawTableBackdrop(sectorRows.length - idx);
          drawSectorTableTitle();
          drawSectorTableHeader();
        }

        const rowTop = y - ROW_H + 2;
        const rowBottom = y + 2;
        doc.setFillColor(...TABLE_FILL);
        doc.rect(TABLE_X, rowTop, TABLE_W, ROW_H, 'F');
        drawRowRule(rowBottom);
        drawColumnRules(rowTop, rowBottom);

        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...TABLE_TEXT);

        const cells = [
          row.Sector || '—',
          formatInteger(Number(row.Number_Exposed_Buildings || 0)),
          formatInteger(Number(row.Number_Damaged_Buildings || 0)),
          formatUsd(Number(row.Building_Loss) || 0),
          formatUsd(sLoss),
        ];
        cells.forEach((cell, i) => {
          if (i === 0) {
            doc.text(cell, TCOL_X[0] + CELL_PAD_X, y);
          } else {
            doc.text(cell, TCOL_X[i] + CELL_PAD_X, y);
          }
        });
        y += ROW_H;
      });

      // Total row
      if (sectorRows.length > 0) {
        if (y + ROW_H + 4 > CONTENT_BOTTOM) {
          y = addReportPage();
          drawTableBackdrop(0, true);
          drawSectorTableTitle();
          drawSectorTableHeader();
        }
        const totalTop = y - ROW_H + 2;
        const totalBottom = y + 2;
        doc.setFillColor(...TOTAL_FILL);
        doc.rect(TABLE_X, totalTop, TABLE_W, ROW_H, 'F');
        drawRowRule(totalBottom);
        drawColumnRules(totalTop, totalBottom);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TABLE_BLUE);
        doc.text('TOTAL', TCOL_X[0] + CELL_PAD_X, y);
        doc.text(formatUsd(totalSectorLoss), TCOL_X[4] + CELL_PAD_X, y);
        y += ROW_H + -2;
      }

      // Data source note
      y += 2;
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...TABLE_TEXT);
      doc.text(
        'Source: PDIE Dashboard / SPC. Loss values shown in USD. Data derived from hazard modelling.',
        PW / 2,
        y + 0.6,
        { align: 'center' }
      );
      y += 10;

      if (tableFooterBannerSrc) {
        const bannerW = CONTENT_W;
        const bannerH = (bannerW * 1153) / 2480;
        ensureSpace(bannerH + 4);
        doc.addImage(tableFooterBannerSrc, 'PNG', MX, y, bannerW, bannerH, undefined, 'FAST');
        y += bannerH + 4;
      }

      // ── MAP IMAGE ─────────────────────────────────────────────────────────
      if (mapCanvas && !useTemplateBackground) {
        y = addReportPage();
        const mapH = 72;
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

      // ── QR CODE ───────────────────────────────────────────────────────────
      try {
        // Generate country-specific URL for QR code
        const countrySlug = countryCode ? getCountrySlugFromCode(countryCode) : null;
        const dashboardUrl = countrySlug
          ? `https://pdie-dashboard.spc.int/${countrySlug}`
          : `https://pdie-dashboard.spc.int`;

        const qrDataUrl = await QRCode.toDataURL(dashboardUrl, {
          width: 256,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        });

        // Add QR code to the reserved slot on page 1
        const qrSize = 20;
        doc.setPage(1);
        const qrX = useTemplateBackground ? TEMPLATE_PAGE1_QR_SLOT.x : PW - MX - qrSize - 2;
        const qrY = useTemplateBackground ? TEMPLATE_PAGE1_QR_SLOT.y : PH - FOOTER_H - qrSize - 8;
        const renderQrSize = useTemplateBackground ? TEMPLATE_PAGE1_QR_SLOT.size : qrSize;
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, renderQrSize, renderQrSize, undefined, 'FAST');
      } catch (error) {
        console.warn('QR code generation skipped:', error);
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
