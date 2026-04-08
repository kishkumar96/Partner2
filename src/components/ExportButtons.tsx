'use client';

import { useRef, useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { Event, ExposureData, EconomicDamageData, Hazard, Sector } from '@/types';
import QRCode from 'qrcode';
import { getCountrySlugFromCode } from '@/utils/countrySlug';
import { logger } from '@/utils/logger';
import PDFPreviewModal, { PDFTemplate } from './PDFPreviewModal';
import {
  PDF_TEMPLATE_CONFIG,
  getPdfContentBottomMm,
  getPdfContentWidthMm,
  getPdfKeyFigureIconLayout,
} from './pdfTemplateConfig';

const normalizeBasePath = (basePath?: string) => {
  if (!basePath || basePath === '/') {
    return '';
  }
  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeadingSlash.replace(/\/+$/, '');
};

const DEFAULT_PRODUCTION_BASE_PATH = '/partner2';
const resolvedBasePath =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (process.env.NODE_ENV === 'production' ? DEFAULT_PRODUCTION_BASE_PATH : undefined);
const BASE_PATH = normalizeBasePath(resolvedBasePath);

// Helper to create asset URLs with correct base path
const pdfAsset = (path: string) => {
  if (!path) return path;
  if (/^(?:[a-z]+:)?\/\//i.test(path)) return path;
  if (!path.startsWith('/')) return path;
  return `${BASE_PATH}${path}`;
};

// OCHA colour palette (RGB tuples)
const OCHA_BLUE: [number, number, number] = [0, 124, 224];
const OCHA_DARK: [number, number, number] = [2, 64, 116];
const OCHA_ORANGE: [number, number, number] = [243, 154, 34];
const TEXT_DARK: [number, number, number] = [47, 47, 47];
const TEXT_MED: [number, number, number] = [84, 84, 84];
const STRIPE: [number, number, number] = [240, 246, 252];

// A4 page geometry (mm)
const PW = PDF_TEMPLATE_CONFIG.page.widthMm;
const PH = PDF_TEMPLATE_CONFIG.page.heightMm;
const MX = PDF_TEMPLATE_CONFIG.page.horizontalMarginMm;
const CONTENT_W = getPdfContentWidthMm();

// Sector table column boundary x-positions (mm from left page edge)
// Widths: [Sector 44, Exposed 34, Damaged 34, Bldg Loss 42, Total Loss 32] = 186
const TCOL_X = [MX, MX + 44, MX + 78, MX + 112, MX + 154, MX + 186];

const FOOTER_H = PDF_TEMPLATE_CONFIG.page.footerHeightMm;
const CONTENT_TOP = PDF_TEMPLATE_CONFIG.page.contentTopMm;
const CONTENT_BOTTOM = getPdfContentBottomMm();
const TEMPLATE_PAGE1_CONTENT_TOP = PDF_TEMPLATE_CONFIG.template.page1ContentTopMm;
const TEMPLATE_CONTINUATION_CONTENT_TOP = PDF_TEMPLATE_CONFIG.template.continuationContentTopMm;
const TEMPLATE_PAGE1_MAP_SLOT = PDF_TEMPLATE_CONFIG.map.slot;
const TEMPLATE_PAGE1_QR_SLOT = PDF_TEMPLATE_CONFIG.template.qrSlot;
const TEMPLATE_KEY_FIGURE_BOXES = PDF_TEMPLATE_CONFIG.keyFigures.boxes;
const MAP_MAX_DIMENSION_PX = 2200;
const MAP_CAPTURE_TIMEOUT_MS = 1500;
const ASSET_FETCH_TIMEOUT_MS = 10000; // Increased for large SVGs in production
const LARGE_SVG_TIMEOUT_MS = 15000; // Extra time for template backgrounds

// Base path for production deployment
const BASE_PATH = process.env.NODE_ENV === 'production' ? '/partner2' : '';

// Helper to create asset URLs with correct base path
const pdfAsset = (path: string) => `${BASE_PATH}${path}`;

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

const getImageElementDimensions = async (src: string): Promise<{ width: number; height: number }> =>
  await new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
      });
    image.onerror = () => reject(new Error('Failed to measure image'));
    image.src = src;
  });

const getContainRect = (
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number
) => {
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  return {
    width: drawWidth,
    height: drawHeight,
    offsetX: (boxWidth - drawWidth) / 2,
    offsetY: (boxHeight - drawHeight) / 2,
  };
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
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const previewTemplateRef = useRef<HTMLDivElement>(null);
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

  const buildPdfFilename = () => {
    const safeCountryName = sanitizeFilenamePart(countryName || 'country');
    const isoDate = new Date().toISOString().split('T')[0];
    return `PDIE-SitRep-${safeCountryName}-${isoDate}.pdf`;
  };

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
      const normalizedPath = pdfAsset(path);
      // URL-encode the path to handle spaces and special characters
      const encodedPath = path
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
      logger.debug(`Fetching asset: ${path} -> ${encodedPath}`);
      const response = await fetch(encodedPath);
      if (!response.ok) {
        logger.warn(`Failed to fetch asset ${path}: ${response.status} ${response.statusText}`);
        return undefined;
      }

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

  const downloadPDFFromPreview = async () => {
    const templateRoot = previewTemplateRef.current;
    if (!templateRoot) {
      logger.warn('downloadPDFFromPreview: previewTemplateRef.current is null');
      return false;
    }

    const pageNodes = Array.from(templateRoot.children).filter(
      (node): node is HTMLDivElement => node instanceof HTMLDivElement
    );
    if (pageNodes.length === 0) {
      logger.warn('downloadPDFFromPreview: no page nodes found in template');
      return false;
    }

    try {
      logger.info(`downloadPDFFromPreview: capturing ${pageNodes.length} pages from preview`);

      const [{ jsPDF }, html2canvasModule] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const html2canvas = html2canvasModule.default;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      for (let index = 0; index < pageNodes.length; index += 1) {
        const pageNode = pageNodes[index];
        logger.info(`downloadPDFFromPreview: capturing page ${index + 1}/${pageNodes.length}`);

        const canvas = await html2canvas(pageNode, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: pageNode.scrollWidth,
          windowHeight: pageNode.scrollHeight,
        });

        const imageData = canvas.toDataURL('image/png');
        if (index > 0) {
          doc.addPage();
        }
        doc.addImage(imageData, 'PNG', 0, 0, PW, PH, undefined, 'FAST');
      }

      logger.info('downloadPDFFromPreview: saving PDF from preview (high-quality)');
      doc.save(buildPdfFilename());
      return true;
    } catch (error) {
      logger.error('downloadPDFFromPreview failed, will fall back to legacy rendering:', error);
      return false;
    }
  };

  // ─── Open PDF Preview Modal ────────────────────────────────────────────────
  const openPDFPreview = async () => {
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

      const cFull = fullCountryName || countryName;
      const eventName = cycloneEventName || events[0]?.name || 'Tropical Cyclone Assessment';
      const reportDate = new Date().toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      // Map country code to assets
      const countryHeaderMap: Record<string, string> = {
        VU: pdfAsset('/pdf-assets/country-headers/DashBoard_Header_Vanuatu.png'),
        CK: pdfAsset('/pdf-assets/country-headers/DashBoard_Header_Cook_Islands.png'),
        TO: pdfAsset('/pdf-assets/country-headers/DashBoard_Header_Tonga.png'),
        WS: pdfAsset('/pdf-assets/country-headers/DashBoard_Header_Samoa.png'),
      };
      const countryFlagMap: Record<string, string> = {
        VU: pdfAsset('/pdf-assets/Country_Flags/Flag_of_Vanuatu.svg.png'),
        CK: pdfAsset('/pdf-assets/Country_Flags/2000px-Flag_of_the_Cook_Islands.svg.png'),
        TO: pdfAsset('/pdf-assets/Country_Flags/Flag_of_Tonga.svg.png'),
        WS: pdfAsset('/pdf-assets/Country_Flags/Flag_of_Samoa.svg.png'),
        FJ: pdfAsset('/pdf-assets/Country_Flags/Flag_of_Fiji.svg.png'),
      };
      const countryHeaderPath = countryCode ? countryHeaderMap[countryCode] : undefined;
      const countryFlagPath = countryCode ? countryFlagMap[countryCode] : undefined;

      // Load assets including templates
      const [
        countryHeaderSrc,
        countryFlagSrc,
        templatePage1Src,
        templatePage2Src,
        personIconSrc,
        buildingIconSrc,
        tableFooterBannerSrc,
      ] = await Promise.all([
        countryHeaderPath
          ? withTimeout(fetchAssetDataUrl(countryHeaderPath), ASSET_FETCH_TIMEOUT_MS)
          : Promise.resolve(undefined),
        countryFlagPath
          ? withTimeout(fetchAssetDataUrl(countryFlagPath), ASSET_FETCH_TIMEOUT_MS)
          : Promise.resolve(undefined),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/PDF1_SVG1.svg'), {
            rasterizeWidthPx: 2480,
            targetHeightPx: 3508,
            fit: 'cover',
            cropAnchorY: 'top',
          }),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/PDF1_SVG2.svg'), {
            rasterizeWidthPx: 2480,
            targetHeightPx: 3508,
            fit: 'cover',
            cropAnchorY: 'top',
          }),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/icons/person.png')),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/icons/house.svg'), { rasterizeWidthPx: 128 }),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/DashBoard_Header_Country3.png')),
          ASSET_FETCH_TIMEOUT_MS
        ),
      ]);

      // Capture map if available
      let mapImageUrl: string | undefined;
      if (includeMapInPdf && mapInstance) {
        try {
          const canvas = await captureMapCanvas(mapInstance);
          if (canvas) {
            mapImageUrl = canvas.toDataURL('image/png');
          }
        } catch (error) {
          logger.warn('Map capture skipped for preview:', error);
        }
      }

      // Prepare key figures
      const ns: Record<string, string> = nationalSummary?.[0] ?? {};
      const totalAffectedPop = Number(ns.Population_Exposed_To_Any_Hazard) || 0;
      const exposedBuildings = Number(ns.Buildings_Exposed_To_Any_Hazard) || 0;
      const damagedBuildings = Number(ns.Damaged_Buildings) || 0;
      const totalLoss = Number(ns.Total_Loss) || 0;

      const keyFigures = [
        {
          label: 'People Affected',
          value: totalAffectedPop > 0 ? integerFormatter.format(totalAffectedPop) : 'N/A',
        },
        {
          label: 'Buildings Damaged',
          value: damagedBuildings > 0 ? integerFormatter.format(damagedBuildings) : 'N/A',
        },
        {
          label: 'Buildings Exposed',
          value: exposedBuildings > 0 ? integerFormatter.format(exposedBuildings) : 'N/A',
        },
        {
          label: 'Total Economic Damage',
          value: totalLoss > 0 ? formatCompactUsd(totalLoss) : 'N/A',
        },
        {
          label: 'Evacuation Centres',
          value: integerFormatter.format(Number(ns.Total_Evacuation_Centres) || 0),
        },
        {
          label: 'Max Wind (km/h)',
          value: `${Number(ns.Max_Wind_Gusts) || 0}`,
        },
      ];

      // Generate situation narrative
      const situationNarrative =
        `${eventName} impacted ${cFull}, resulting in widespread damage across multiple sectors. ` +
        (totalAffectedPop > 0
          ? `Approximately ${integerFormatter.format(totalAffectedPop)} people were exposed to hazard impacts. `
          : '') +
        (damagedBuildings > 0
          ? `${integerFormatter.format(damagedBuildings)} buildings were damaged out of ${integerFormatter.format(exposedBuildings)} in the exposed area. `
          : '') +
        (totalLoss > 0
          ? `Total estimated economic losses amount to ${formatCompactUsd(totalLoss)}. `
          : '') +
        `This Situation Report was generated from the PDIE (Pacific Disaster Impact & Exposure) ` +
        `Dashboard using satellite-derived and modelled hazard and exposure data provided by SPC.`;

      const countrySlug = countryCode ? getCountrySlugFromCode(countryCode) : null;
      const dashboardUrl = countrySlug
        ? `https://pdie-dashboard.spc.int/${countrySlug}`
        : 'https://pdie-dashboard.spc.int';
      const qrCodeSrc = await QRCode.toDataURL(dashboardUrl, {
        width: 256,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      });

      // Set preview data and open modal
      setPreviewData({
        countryHeaderSrc,
        countryFlagSrc,
        templatePage1Src,
        templatePage2Src,
        reportDate,
        fullCountryName: cFull,
        cycloneEventName: eventName,
        mapImageUrl,
        keyFigures,
        impactBySector,
        nationalSummary,
        formatNumber: (n: number) => integerFormatter.format(n),
        formatCurrency: (n: number) => formatCompactUsd(n),
        personIconSrc,
        buildingIconSrc,
        situationNarrative,
        qrCodeSrc,
        tableFooterBannerSrc,
      });
      // Log which assets failed to load
      const failedAssets = [];
      if (!templatePage1Src) failedAssets.push('Template Page 1');
      if (!templatePage2Src) failedAssets.push('Template Page 2');
      if (!personIconSrc) failedAssets.push('Person Icon');
      if (!buildingIconSrc) failedAssets.push('Building Icon');
      if (countryHeaderPath && !countryHeaderSrc) failedAssets.push('Country Header');
      if (countryFlagPath && !countryFlagSrc) failedAssets.push('Country Flag');

      if (failedAssets.length > 0) {
        logger.warn(`PDF assets failed to load: ${failedAssets.join(', ')}`);
      }

      setShowPreview(true);
    } catch (error) {
      logger.error('PDF preview failed:', error);
      setExportError('Failed to load PDF preview. Please try again.');
      setTimeout(() => setExportError(null), 5000);
    } finally {
      pdfExportInFlightRef.current = false;
      setIsExportingPDF(false);
    }
  };

  // ─── OCHA SitRep PDF (legacy jsPDF approach - kept for fallback) ───────────
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

      const downloadedFromPreview = await downloadPDFFromPreview();
      if (downloadedFromPreview) {
        logger.info('PDF download completed using high-quality preview capture');
        return;
      }

      logger.warn('Preview-based download not available, using legacy jsPDF rendering');
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
        VU: pdfAsset('/pdf-assets/country-headers/DashBoard_Header_Vanuatu.png'),
        CK: pdfAsset('/pdf-assets/country-headers/DashBoard_Header_Cook_Islands.png'),
        TO: pdfAsset('/pdf-assets/country-headers/DashBoard_Header_Tonga.png'),
        WS: pdfAsset('/pdf-assets/country-headers/DashBoard_Header_Samoa.png'),
      };
      const countryFlagMap: Record<string, string> = {
        VU: pdfAsset('/pdf-assets/Country_Flags/Flag_of_Vanuatu.svg.png'),
        CK: pdfAsset('/pdf-assets/Country_Flags/2000px-Flag_of_the_Cook_Islands.svg.png'),
        TO: pdfAsset('/pdf-assets/Country_Flags/Flag_of_Tonga.svg.png'),
        WS: pdfAsset('/pdf-assets/Country_Flags/Flag_of_Samoa.svg.png'),
        FJ: pdfAsset('/pdf-assets/Country_Flags/Flag_of_Fiji.svg.png'),
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
          fetchAssetDataUrl(pdfAsset('/pdf-assets/Topbackdrop.svg'), {
            rasterizeWidthPx: 2400,
            targetHeightPx: 460,
            fit: 'cover',
            cropAnchorY: 'top',
          }),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/PDF1_SVG1.svg'), {
            rasterizeWidthPx: 2480,
            targetHeightPx: 3508,
            fit: 'cover',
            cropAnchorY: 'top',
          }),
          LARGE_SVG_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/PDF1_SVG2.svg'), {
            rasterizeWidthPx: 2480,
            targetHeightPx: 3508,
            fit: 'cover',
            cropAnchorY: 'top',
          }),
          LARGE_SVG_TIMEOUT_MS
        ),
        // Load country header if available
        countryHeaderPath
          ? withTimeout(fetchAssetDataUrl(countryHeaderPath), ASSET_FETCH_TIMEOUT_MS)
          : Promise.resolve(undefined),
        countryFlagPath
          ? withTimeout(fetchAssetDataUrl(countryFlagPath), ASSET_FETCH_TIMEOUT_MS)
          : Promise.resolve(undefined),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/DashBoard_Header_Country3.png')),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/icons/person.png')),
          ASSET_FETCH_TIMEOUT_MS
        ),
        withTimeout(
          fetchAssetDataUrl(pdfAsset('/pdf-assets/icons/house.svg'), { rasterizeWidthPx: 128 }),
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
          logger.warn('Map capture skipped for PDF export:', error);
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

      // Prefer the authoritative impact-by-sector CSV rows when available.
      // The derived rows are a fallback and do not carry damaged-building counts.
      const sectorRows =
        impactBySector && impactBySector.length > 0 ? impactBySector : derivedSectorRows;

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
        doc.text(`${PDF_TEMPLATE_CONFIG.labels.reportPrefix} ${reportDate}`, PW - MX, 10, {
          align: 'right',
        });

        // Country full name
        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'normal');
        doc.text(cFull, MX, 31);

        // Branding right
        doc.setFontSize(7.5);
        doc.text(PDF_TEMPLATE_CONFIG.labels.branding.replace(' | ', '  |  '), PW - MX, 31, {
          align: 'right',
        });

        // Add map if available (non-template layout)
        if (mapCanvas) {
          // This will be on page 2 if content overflows
          const mapH = 72;
          const mapY = 49; // Default starting Y for content

          // A simple check to see if we need a new page. This is not perfect.
          // A better implementation would track `y` position.
          // For now, we assume it goes on a new page if there's a lot of sector data.
          if (sectorRows.length > 10) {
            addReportPage();
          }

          doc.setFontSize(9.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(...TEXT_DARK);
          doc.text('HAZARD IMPACT MAP', MX, mapY);
          doc.setDrawColor(...OCHA_BLUE);
          doc.setLineWidth(0.5);
          doc.line(MX, mapY + 3, PW - MX, mapY + 3);
          doc.addImage(mapCanvas, 'PNG', MX, mapY + 7, CONTENT_W, mapH, undefined, 'FAST');
          doc.setFontSize(6.5);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(...OCHA_DARK);
          doc.text(PDF_TEMPLATE_CONFIG.map.captionText, MX, mapY + 7 + mapH + 3);
        }
      } else {
        // When using template, add dynamic text overlays
        doc.setTextColor(...OCHA_DARK);

        // Country header at the top of the page (above map slot)
        if (countryHeaderSrc) {
          const headerWidth = PW;
          const headerHeight = PDF_TEMPLATE_CONFIG.template.headerHeightMm;
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, headerWidth, headerHeight, 'F');

          try {
            const { width, height } = await getImageElementDimensions(countryHeaderSrc);
            const fitted = getContainRect(width, height, headerWidth, headerHeight);
            doc.addImage(
              countryHeaderSrc,
              'PNG',
              fitted.offsetX,
              fitted.offsetY,
              fitted.width,
              fitted.height,
              undefined,
              'FAST'
            );
          } catch {
            doc.addImage(
              countryHeaderSrc,
              'PNG',
              0,
              0,
              headerWidth,
              headerHeight,
              undefined,
              'FAST'
            );
          }
        }

        // This rectangle provides a background for the text lines below.
        doc.setFillColor(236, 248, 252);
        doc.rect(
          0,
          PDF_TEMPLATE_CONFIG.template.headerBanner.topMm,
          PW,
          PDF_TEMPLATE_CONFIG.template.headerBanner.heightMm,
          'F'
        );
        doc.setDrawColor(...OCHA_BLUE);
        doc.setLineWidth(0.9);
        doc.line(0, PDF_TEMPLATE_CONFIG.map.slot.y, PW, PDF_TEMPLATE_CONFIG.map.slot.y);

        if (countryFlagSrc) {
          const flagX = 8;
          const flagY = 32;
          const flagW = 26;
          const flagH = 12;
          // Draw white background to cover any lines behind the flag
          doc.setFillColor(255, 255, 255);
          doc.rect(flagX, flagY, flagW, flagH, 'F');
          doc.addImage(countryFlagSrc, 'PNG', flagX, flagY, flagW, flagH, undefined, 'FAST');
        }

        // Report number / date
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `${PDF_TEMPLATE_CONFIG.labels.reportPrefix} ${reportDate}`,
          PW - MX,
          PDF_TEMPLATE_CONFIG.template.reportDateTopMm,
          { align: 'right' }
        );

        // Branding line
        doc.setFontSize(8.5);
        doc.text(
          PDF_TEMPLATE_CONFIG.labels.branding,
          PW - MX,
          PDF_TEMPLATE_CONFIG.template.brandingTopMm,
          { align: 'right' }
        );

        // Add map to its designated slot on the template
        if (mapCanvas) {
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
          doc.setTextColor(...OCHA_DARK);
          doc.text(PDF_TEMPLATE_CONFIG.map.captionText, PW / 2, y + h + 3, { align: 'center' });
        }
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
      doc.text(PDF_TEMPLATE_CONFIG.labels.keyFiguresTitle, PW / 2, y, { align: 'center' });
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
          const iconLayout = getPdfKeyFigureIconLayout(i);
          const iconSize = iconLayout.iconSizeMm;
          const iconY = box.y + iconLayout.exportIconOffsetYmm;
          const valueY = box.y + iconLayout.exportValueOffsetYmm;
          const labelLines = doc.splitTextToSize(fig.label.toUpperCase(), box.w - 3);
          const labelLineHeight = 2.3;
          const labelStartY =
            box.y +
            box.h -
            iconLayout.exportLabelBottomInsetMm -
            labelLineHeight * Math.max(0, labelLines.length - 1);

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
      doc.text(PDF_TEMPLATE_CONFIG.labels.situationOverviewTitle, MX, y);
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
      doc.setTextColor(...OCHA_DARK);
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
        doc.text(PDF_TEMPLATE_CONFIG.labels.sectorAnalysisTitle, MX, y);
        y += 5;
      }

      const ROW_H = 7;
      const THEAD_H = 13;
      const TABLE_TITLE_SPACE = 15;
      const CELL_PAD_X = 2;
      const TABLE_X = MX;
      const TABLE_W = TCOL_X[5] - TCOL_X[0];
      const TABLE_RIGHT = TABLE_X + TABLE_W;
      const TABLE_BLUE: [number, number, number] = [0, 70, 173];
      const TABLE_FILL: [number, number, number] = [241, 248, 252];
      const TOTAL_FILL: [number, number, number] = [157, 211, 231];
      const TABLE_RULE: [number, number, number] = [98, 211, 241];
      const TABLE_TEXT: [number, number, number] = OCHA_DARK;
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
        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...TABLE_BLUE);
        doc.text(PDF_TEMPLATE_CONFIG.labels.sectorAnalysisTitle, PW / 2, y - 11, {
          align: 'center',
        });
      };
      const drawSectorTableHeader = () => {
        const headerTop = y - THEAD_H + 3;
        const headerCenterY = headerTop + THEAD_H / 2;
        const headerLineHeight = 2.9;
        doc.setFillColor(...TABLE_BLUE);
        doc.rect(TABLE_X, headerTop, TABLE_W, THEAD_H, 'F');
        doc.setFontSize(10.5);
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
        y = headerTop + THEAD_H + 2;
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

        doc.setFontSize(7);
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
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...OCHA_DARK);
        doc.text('TOTAL', TCOL_X[0] + CELL_PAD_X, y);
        doc.text(formatUsd(totalSectorLoss), TCOL_X[4] + CELL_PAD_X, y);
        y += ROW_H + -2;
      }

      // Data source note
      y += 2;
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...TABLE_TEXT);
      doc.text(PDF_TEMPLATE_CONFIG.labels.dataSourceNote, PW / 2, y + 0.6, {
        align: 'center',
      });
      y += 10;

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
        logger.warn('QR code generation skipped:', error);
      }

      // ── Footer on all pages ───────────────────────────────────────────────
      const pageCount = doc.getNumberOfPages();
      for (let p = 1; p <= pageCount; p++) drawFooter(p, pageCount);

      doc.save(buildPdfFilename());
    } catch (error) {
      logger.error('PDF export failed:', error);
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
      logger.error('CSV export failed:', error);
      setExportError('Failed to export CSV. Please try again.');
      setTimeout(() => setExportError(null), 5000);
    } finally {
      csvExportInFlightRef.current = false;
      setIsExportingCSV(false);
    }
  };

  return (
    <>
      <div className="flex gap-1.5 sm:gap-2 items-center flex-shrink-0">
        {exportError && (
          <span className="text-xs sm:text-sm text-red-600 dark:text-red-400 hidden lg:block">
            {exportError}
          </span>
        )}
        <button
          onClick={openPDFPreview}
          disabled={disabled || isExportingPDF}
          aria-label="Export data as PDF report"
          className={`group inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg border transition-transform duration-200 ease-out whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 will-change-transform ${
            disabled
              ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed opacity-60'
              : 'bg-gradient-to-br from-red-500/90 to-rose-600/90 border-red-400/30 hover:scale-105 hover:-translate-y-0.5 focus-visible:ring-red-300/70'
          }`}
          style={!disabled ? { boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25)' } : undefined}
          title={disabled ? 'No data available to export' : 'Preview & Export PDF'}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/15 border border-white/20 group-hover:bg-white/20 transition-colors">
            <FileDown className="w-3.5 h-3.5" />
          </span>
          <span className="hidden xl:inline">{isExportingPDF ? 'Loading' : 'Preview'}</span> PDF
        </button>
        <button
          onClick={downloadCSV}
          disabled={disabled || isExportingCSV}
          aria-label="Export data as CSV file"
          className={`group inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white rounded-lg border transition-transform duration-200 ease-out whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 will-change-transform ${
            disabled
              ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed opacity-60'
              : 'bg-gradient-to-br from-emerald-500/90 to-teal-600/90 border-emerald-300/30 hover:scale-105 hover:-translate-y-0.5 focus-visible:ring-emerald-300/70'
          }`}
          style={!disabled ? { boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)' } : undefined}
          title={disabled ? 'No data available to export' : 'Export as CSV'}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/15 border border-white/20 group-hover:bg-white/20 transition-colors">
            <FileSpreadsheet className="w-3.5 h-3.5" />
          </span>
          <span className="hidden xl:inline">{isExportingCSV ? 'Exporting' : 'Export'}</span> CSV
        </button>
      </div>

      {/* PDF Preview Modal */}
      {showPreview && previewData && (
        <PDFPreviewModal
          isOpen={showPreview}
          onClose={() => {
            setShowPreview(false);
            setPreviewData(null);
          }}
          onDownload={downloadPDF}
          title="PDF Report Preview"
          isGenerating={isExportingPDF}
        >
          <PDFTemplate
            ref={previewTemplateRef}
            countryHeaderSrc={previewData.countryHeaderSrc}
            countryFlagSrc={previewData.countryFlagSrc}
            templatePage1Src={previewData.templatePage1Src}
            templatePage2Src={previewData.templatePage2Src}
            tableFooterBannerSrc={previewData.tableFooterBannerSrc}
            reportDate={previewData.reportDate}
            fullCountryName={previewData.fullCountryName}
            cycloneEventName={previewData.cycloneEventName}
            mapImageUrl={previewData.mapImageUrl}
            keyFigures={previewData.keyFigures}
            impactBySector={previewData.impactBySector}
            nationalSummary={previewData.nationalSummary}
            formatNumber={previewData.formatNumber}
            formatCurrency={previewData.formatCurrency}
            personIconSrc={previewData.personIconSrc}
            buildingIconSrc={previewData.buildingIconSrc}
            situationNarrative={previewData.situationNarrative}
            qrCodeSrc={previewData.qrCodeSrc}
          />
        </PDFPreviewModal>
      )}
    </>
  );
}
