'use client';

import { useEffect, forwardRef } from 'react';
import { X, Download, RefreshCw } from 'lucide-react';
import {
  PDF_TEMPLATE_CONFIG,
  getPdfContentWidthMm,
  getPdfKeyFigureIconLayout,
} from './pdfTemplateConfig';

interface PDFPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => Promise<void>;
  children: React.ReactNode;
  title?: string;
  isGenerating?: boolean;
}

export default function PDFPreviewModal({
  isOpen,
  onClose,
  onDownload,
  children,
  title = 'PDF Preview',
  isGenerating = false,
}: PDFPreviewModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.85)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full h-full max-w-[900px] max-h-[95vh] bg-slate-900 rounded-lg shadow-2xl m-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 rounded-t-lg">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {isGenerating && (
              <span className="text-sm text-slate-400 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onDownload}
              disabled={isGenerating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-red-500 to-rose-600 rounded-lg border border-red-400/30 hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center w-9 h-9 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              title="Close preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview Area */}
        <div className="flex-1 overflow-auto bg-slate-800 p-8">
          <div className="mx-auto" style={{ maxWidth: `${PDF_TEMPLATE_CONFIG.page.widthMm}mm` }}>
            <div
              className="shadow-2xl"
              style={{
                width: `${PDF_TEMPLATE_CONFIG.page.widthMm}mm`,
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// PDF Template component that renders as HTML matching jsPDF layout exactly
interface PDFTemplateProps {
  countryHeaderSrc?: string;
  countryFlagSrc?: string;
  templatePage1Src?: string;
  templatePage2Src?: string;
  tableFooterBannerSrc?: string;
  reportDate: string;
  fullCountryName: string;
  cycloneEventName: string;
  mapImageUrl?: string;
  keyFigures: Array<{
    label: string;
    value: string;
    icon?: string;
  }>;
  impactBySector: any[];
  nationalSummary: any[];
  formatNumber: (n: number) => string;
  formatCurrency: (n: number) => string;
  personIconSrc?: string;
  buildingIconSrc?: string;
  situationNarrative?: string;
  qrCodeSrc?: string;
}

export const PDFTemplate = forwardRef<HTMLDivElement, PDFTemplateProps>(
  (
    {
      countryHeaderSrc,
      countryFlagSrc,
      templatePage1Src,
      templatePage2Src,
      tableFooterBannerSrc,
      reportDate,
      fullCountryName,
      cycloneEventName,
      mapImageUrl,
      keyFigures,
      impactBySector,
      nationalSummary,
      formatNumber,
      formatCurrency,
      personIconSrc,
      buildingIconSrc,
      situationNarrative,
      qrCodeSrc,
    },
    ref
  ) => {
    const useTemplate = Boolean(templatePage1Src);

    return (
      <div
        ref={ref}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${PDF_TEMPLATE_CONFIG.page.previewGapMm}mm`,
        }}
      >
        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 1 - OVERVIEW */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div
          className="relative bg-white"
          style={{
            width: `${PDF_TEMPLATE_CONFIG.page.widthMm}mm`,
            height: `${PDF_TEMPLATE_CONFIG.page.heightMm}mm`,
            fontFamily: 'Helvetica, Arial, sans-serif',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
            overflow: 'hidden',
          }}
        >
          {/* Template background (if available) */}
          {useTemplate && templatePage1Src && (
            <img
              src={templatePage1Src}
              alt="Template"
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{
                zIndex: 0,
                width: `${PDF_TEMPLATE_CONFIG.page.widthMm}mm`,
                height: `${PDF_TEMPLATE_CONFIG.page.heightMm}mm`,
              }}
            />
          )}

          {/* Content layer */}
          <div className="relative" style={{ zIndex: 1 }}>
            {/* Country Header */}
            {countryHeaderSrc && (
              <div
                className="absolute"
                style={{
                  top: 0,
                  left: 0,
                  width: `${PDF_TEMPLATE_CONFIG.page.widthMm}mm`,
                  height: `${PDF_TEMPLATE_CONFIG.template.headerHeightMm}mm`,
                  overflow: 'hidden',
                  background: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={countryHeaderSrc}
                  alt="Country Header"
                  className="w-full h-full object-contain"
                />
              </div>
            )}

            {/* Light blue banner section with flag - exactly matching jsPDF layout */}
            <div
              className="absolute"
              style={{
                top: `${PDF_TEMPLATE_CONFIG.template.headerBanner.topMm}mm`,
                left: 0,
                width: `${PDF_TEMPLATE_CONFIG.page.widthMm}mm`,
                background: 'rgb(236, 248, 252)',
                height: `${PDF_TEMPLATE_CONFIG.template.headerBanner.heightMm}mm`,
                /*borderBottom: '0.9pt solid rgb(0, 124, 224)',*/
              }}
            >
              {/* Flag with white background to cover any underlying lines */}
              {countryFlagSrc && (
                <div
                  className="absolute"
                  style={{
                    left: '8mm',
                    top: '6mm',
                    width: '26mm',
                    height: '12mm',
                  }}
                >
                  {/* White background rectangle behind flag */}
                  <div className="absolute inset-0" style={{ background: 'white', zIndex: 1 }} />
                  <img
                    src={countryFlagSrc}
                    alt="Country Flag"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ zIndex: 2 }}
                  />
                </div>
              )}

              {/* Report info text */}
              <div
                className="absolute"
                style={{
                  top: '2.5mm',
                  right: '12mm',
                  fontSize: '8.5pt',
                  lineHeight: '1.15',
                }}
              >
                <div className="text-right" style={{ color: 'rgb(2, 64, 116)' }}>
                  {PDF_TEMPLATE_CONFIG.labels.reportPrefix} {reportDate}
                </div>
                <div
                  className="text-right"
                  style={{ color: 'rgb(2, 64, 116)', marginTop: '0.4mm' }}
                >
                  {PDF_TEMPLATE_CONFIG.labels.branding}
                </div>
              </div>
            </div>

            {/* Map section - positioned to match template slot (y = 47mm, h = 96mm) */}
            {mapImageUrl && (
              <div
                className="absolute"
                style={{
                  top: `${PDF_TEMPLATE_CONFIG.map.slot.y}mm`,
                  left: `${PDF_TEMPLATE_CONFIG.map.slot.x}mm`,
                  width: `${PDF_TEMPLATE_CONFIG.map.slot.w}mm`,
                  height: `${PDF_TEMPLATE_CONFIG.map.slot.h}mm`,
                  background: 'rgb(236, 248, 252)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: `${PDF_TEMPLATE_CONFIG.map.imageHeightMm}mm`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={mapImageUrl}
                    alt="Map snapshot"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </div>
                <div
                  style={{
                    width: '100%',
                    height: `${PDF_TEMPLATE_CONFIG.map.captionHeightMm}mm`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgb(0, 124, 224)',
                    fontSize: '8pt',
                    textAlign: 'center',
                    padding: `0 ${PDF_TEMPLATE_CONFIG.map.captionPaddingXmm}mm`,
                  }}
                >
                  {PDF_TEMPLATE_CONFIG.map.captionText}
                </div>
              </div>
            )}

            {useTemplate && (
              <div
                className="absolute"
                style={{
                  top: `${PDF_TEMPLATE_CONFIG.template.keyFiguresTitleTopMm}mm`,
                  left: `${PDF_TEMPLATE_CONFIG.template.keyFiguresTitleLeftMm}mm`,
                  width: `${PDF_TEMPLATE_CONFIG.template.keyFiguresTitleWidthMm}mm`,
                  textAlign: 'center',
                  color: 'rgb(0, 124, 224)',
                  fontSize: '16pt',
                  fontWeight: 'bold',
                  letterSpacing: '0.4px',
                }}
              >
                {PDF_TEMPLATE_CONFIG.labels.keyFiguresTitle}
              </div>
            )}

            {/* When using template: Position key figures exactly on template boxes */}
            {useTemplate &&
              keyFigures.slice(0, 6).map((fig, idx) => {
                const box = PDF_TEMPLATE_CONFIG.keyFigures.boxes[idx];
                const iconMap = [
                  personIconSrc,
                  undefined,
                  buildingIconSrc,
                  undefined,
                  undefined,
                  undefined,
                ];
                const iconSrc = iconMap[idx];
                const iconLayout = getPdfKeyFigureIconLayout(idx);

                return (
                  <div
                    key={idx}
                    className="absolute"
                    style={{
                      left: `${box.x}mm`,
                      top: `${box.y}mm`,
                      width: `${box.w}mm`,
                      height: `${box.h}mm`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {iconSrc && (
                      <img
                        src={iconSrc}
                        alt=""
                        style={{
                          width: `${iconLayout.iconSizeMm}mm`,
                          height: `${iconLayout.iconSizeMm}mm`,
                          marginBottom: `${iconLayout.previewMarginBottomMm}mm`,
                          marginTop: `${iconLayout.previewMarginTopMm}mm`,
                        }}
                      />
                    )}
                    <div
                      style={{
                        color: 'white',
                        fontSize: '15pt',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        marginTop: iconSrc ? `${iconLayout.previewValueMarginTopMm}mm` : '0',
                      }}
                    >
                      {fig.value}
                    </div>
                    <div
                      style={{
                        color: 'white',
                        fontSize: '8pt',
                        textAlign: 'center',
                        marginTop: '1mm',
                        textTransform: 'uppercase',
                        lineHeight: '1.15',
                        padding: '0 2mm',
                      }}
                    >
                      {fig.label}
                    </div>
                  </div>
                );
              })}

            {/* When NOT using template: Show traditional layout */}
            {!useTemplate && (
              <>
                {/* Key Figures Section */}
                <div style={{ marginTop: '15mm', padding: '0 12mm' }}>
                  <h1
                    className="text-center font-bold"
                    style={{
                      color: 'rgb(0, 124, 224)',
                      fontSize: '16pt',
                      marginBottom: '8mm',
                    }}
                  >
                    {PDF_TEMPLATE_CONFIG.labels.keyFiguresTitle}
                  </h1>

                  {/* Key figures grid - 3 columns x 2 rows */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '4mm',
                      marginBottom: '10mm',
                    }}
                  >
                    {keyFigures.slice(0, 6).map((fig, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: 'rgb(240, 246, 252)',
                          borderLeft: '3mm solid rgb(243, 154, 34)',
                          borderRadius: '2mm',
                          padding: '8mm 4mm',
                          textAlign: 'center',
                        }}
                      >
                        <div
                          style={{
                            color: 'rgb(2, 64, 116)',
                            fontSize: '13pt',
                            fontWeight: 'bold',
                            marginBottom: '2mm',
                          }}
                        >
                          {fig.value}
                        </div>
                        <div
                          style={{
                            color: 'rgb(110, 110, 110)',
                            fontSize: '6.5pt',
                            textTransform: 'uppercase',
                            letterSpacing: '0.3px',
                          }}
                        >
                          {fig.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Situation Overview - positioned after key figures */}
            {situationNarrative && (
              <div
                className="absolute"
                style={{
                  top: useTemplate ? `${PDF_TEMPLATE_CONFIG.template.situationTopMm}mm` : '100mm',
                  left: `${PDF_TEMPLATE_CONFIG.page.horizontalMarginMm}mm`,
                  right: `${PDF_TEMPLATE_CONFIG.page.horizontalMarginMm}mm`,
                }}
              >
                <h2
                  style={{
                    color: 'rgb(0, 124, 224)',
                    fontSize: '13pt',
                    fontWeight: 'bold',
                    marginBottom: '6mm',
                  }}
                >
                  {PDF_TEMPLATE_CONFIG.labels.situationOverviewTitle}
                </h2>
                <p
                  style={{
                    color: 'rgb(0, 124, 224)',
                    fontSize: '11pt',
                    lineHeight: '1.5',
                  }}
                >
                  {situationNarrative}
                </p>
              </div>
            )}

            {qrCodeSrc && (
              <div
                className="absolute"
                style={{
                  left: useTemplate ? `${PDF_TEMPLATE_CONFIG.template.qrSlot.x}mm` : '176mm',
                  top: useTemplate ? `${PDF_TEMPLATE_CONFIG.template.qrSlot.y}mm` : '260mm',
                  width: `${PDF_TEMPLATE_CONFIG.template.qrSlot.size}mm`,
                  height: `${PDF_TEMPLATE_CONFIG.template.qrSlot.size}mm`,
                  background: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '1mm',
                }}
              >
                <img
                  src={qrCodeSrc}
                  alt="Dashboard QR code"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* PAGE 2 - SECTOR ANALYSIS TABLE */}
        {/* ═══════════════════════════════════════════════════════════ */}
        <div
          className="relative bg-white"
          style={{
            width: `${PDF_TEMPLATE_CONFIG.page.widthMm}mm`,
            height: `${PDF_TEMPLATE_CONFIG.page.heightMm}mm`,
            fontFamily: 'Helvetica, Arial, sans-serif',
            pageBreakBefore: 'always',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
            overflow: 'hidden',
          }}
        >
          {/* Page 2 Template Background */}
          {templatePage2Src && (
            <img
              src={templatePage2Src}
              alt="Page 2 template"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${PDF_TEMPLATE_CONFIG.page.widthMm}mm`,
                height: `${PDF_TEMPLATE_CONFIG.page.heightMm}mm`,
                objectFit: 'cover',
                zIndex: 0,
              }}
            />
          )}

          {/* Content container */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Table title */}
            <h1
              style={{
                position: 'absolute',
                top: `${PDF_TEMPLATE_CONFIG.template.page2TitleTopMm}mm`,
                left: 0,
                width: `${PDF_TEMPLATE_CONFIG.page.widthMm}mm`,
                textAlign: 'center',
                fontSize: '15pt',
                fontWeight: 'bold',
                color: 'rgb(0, 70, 173)',
              }}
            >
              {PDF_TEMPLATE_CONFIG.labels.sectorAnalysisTitle}
            </h1>

            {/* Table */}
            <div
              style={{
                position: 'absolute',
                top: `${PDF_TEMPLATE_CONFIG.template.page2TableTopMm}mm`,
                left: `${PDF_TEMPLATE_CONFIG.page.horizontalMarginMm}mm`,
                right: `${PDF_TEMPLATE_CONFIG.page.horizontalMarginMm}mm`,
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  backgroundColor: 'white',
                }}
              >
                {/* Table header */}
                <thead>
                  <tr>
                    <th
                      style={{
                        backgroundColor: 'rgb(0, 70, 173)',
                        color: 'white',
                        padding: '4mm 2mm',
                        fontSize: '10.5pt',
                        fontWeight: 'bold',
                        textAlign: 'left',
                        border: 'none',
                      }}
                    >
                      Sector
                    </th>
                    <th
                      style={{
                        backgroundColor: 'rgb(0, 70, 173)',
                        color: 'white',
                        padding: '4mm 2mm',
                        fontSize: '10.5pt',
                        fontWeight: 'bold',
                        textAlign: 'left',
                        borderLeft: '0.35mm solid rgb(98, 211, 241)',
                      }}
                    >
                      Exposed
                      <br />
                      Bldgs
                    </th>
                    <th
                      style={{
                        backgroundColor: 'rgb(0, 70, 173)',
                        color: 'white',
                        padding: '4mm 2mm',
                        fontSize: '10.5pt',
                        fontWeight: 'bold',
                        textAlign: 'left',
                        borderLeft: '0.35mm solid rgb(98, 211, 241)',
                      }}
                    >
                      Damaged
                      <br />
                      Bldgs
                    </th>
                    <th
                      style={{
                        backgroundColor: 'rgb(0, 70, 173)',
                        color: 'white',
                        padding: '4mm 2mm',
                        fontSize: '10.5pt',
                        fontWeight: 'bold',
                        textAlign: 'left',
                        borderLeft: '0.35mm solid rgb(98, 211, 241)',
                      }}
                    >
                      Building Loss
                      <br />
                      (USD)
                    </th>
                    <th
                      style={{
                        backgroundColor: 'rgb(0, 70, 173)',
                        color: 'white',
                        padding: '4mm 2mm',
                        fontSize: '10.5pt',
                        fontWeight: 'bold',
                        textAlign: 'left',
                        borderLeft: '0.35mm solid rgb(98, 211, 241)',
                      }}
                    >
                      Total Loss (USD)
                    </th>
                  </tr>
                </thead>
                {/* Table body */}
                <tbody>
                  {impactBySector && impactBySector.length > 0 ? (
                    impactBySector.map((row: any, idx: number) => (
                      <tr key={idx}>
                        <td
                          style={{
                            backgroundColor: 'rgb(241, 248, 252)',
                            color: 'rgb(0, 124, 224)',
                            padding: '2mm 2mm',
                            fontSize: '7pt',
                            borderTop: '0.35mm solid rgb(98, 211, 241)',
                          }}
                        >
                          {row.Sector || '—'}
                        </td>
                        <td
                          style={{
                            backgroundColor: 'rgb(241, 248, 252)',
                            color: 'rgb(0, 124, 224)',
                            padding: '2mm 2mm',
                            fontSize: '7pt',
                            borderTop: '0.35mm solid rgb(98, 211, 241)',
                            borderLeft: '0.35mm solid rgb(98, 211, 241)',
                          }}
                        >
                          {formatNumber(Number(row.Number_Exposed_Buildings || 0))}
                        </td>
                        <td
                          style={{
                            backgroundColor: 'rgb(241, 248, 252)',
                            color: 'rgb(0, 124, 224)',
                            padding: '2mm 2mm',
                            fontSize: '7pt',
                            borderTop: '0.35mm solid rgb(98, 211, 241)',
                            borderLeft: '0.35mm solid rgb(98, 211, 241)',
                          }}
                        >
                          {formatNumber(Number(row.Number_Damaged_Buildings || 0))}
                        </td>
                        <td
                          style={{
                            backgroundColor: 'rgb(241, 248, 252)',
                            color: 'rgb(0, 124, 224)',
                            padding: '2mm 2mm',
                            fontSize: '7pt',
                            borderTop: '0.35mm solid rgb(98, 211, 241)',
                            borderLeft: '0.35mm solid rgb(98, 211, 241)',
                          }}
                        >
                          {formatCurrency(Number(row.Building_Loss || 0))}
                        </td>
                        <td
                          style={{
                            backgroundColor: 'rgb(241, 248, 252)',
                            color: 'rgb(0, 124, 224)',
                            padding: '2mm 2mm',
                            fontSize: '7pt',
                            borderTop: '0.35mm solid rgb(98, 211, 241)',
                            borderLeft: '0.35mm solid rgb(98, 211, 241)',
                          }}
                        >
                          {formatCurrency(Number(row.Total_Loss || 0))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          padding: '10mm',
                          textAlign: 'center',
                          color: 'rgb(110, 110, 110)',
                          fontSize: '10pt',
                        }}
                      >
                        No sector data available
                      </td>
                    </tr>
                  )}
                  {/* Total row */}
                  {impactBySector && impactBySector.length > 0 && (
                    <tr>
                      <td
                        style={{
                          backgroundColor: 'rgb(157, 211, 231)',
                          color: 'rgb(0, 124, 224)',
                          padding: '2mm 2mm',
                          fontSize: '7pt',
                          fontWeight: 'bold',
                          borderTop: '0.35mm solid rgb(98, 211, 241)',
                        }}
                      >
                        TOTAL
                      </td>
                      <td
                        style={{
                          backgroundColor: 'rgb(157, 211, 231)',
                          borderTop: '0.35mm solid rgb(98, 211, 241)',
                          borderLeft: '0.35mm solid rgb(98, 211, 241)',
                        }}
                      ></td>
                      <td
                        style={{
                          backgroundColor: 'rgb(157, 211, 231)',
                          borderTop: '0.35mm solid rgb(98, 211, 241)',
                          borderLeft: '0.35mm solid rgb(98, 211, 241)',
                        }}
                      ></td>
                      <td
                        style={{
                          backgroundColor: 'rgb(157, 211, 231)',
                          borderTop: '0.35mm solid rgb(98, 211, 241)',
                          borderLeft: '0.35mm solid rgb(98, 211, 241)',
                        }}
                      ></td>
                      <td
                        style={{
                          backgroundColor: 'rgb(157, 211, 231)',
                          color: 'rgb(0, 124, 224)',
                          padding: '2mm 2mm',
                          fontSize: '7pt',
                          fontWeight: 'bold',
                          borderTop: '0.35mm solid rgb(98, 211, 241)',
                          borderLeft: '0.35mm solid rgb(98, 211, 241)',
                        }}
                      >
                        {formatCurrency(
                          impactBySector.reduce(
                            (sum, row) => sum + (Number(row.Total_Loss) || 0),
                            0
                          )
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Data source note */}
              <p
                style={{
                  marginTop: '3mm',
                  textAlign: 'center',
                  fontSize: '6.5pt',
                  fontStyle: 'italic',
                  color: 'rgb(0, 124, 224)',
                }}
              >
                {PDF_TEMPLATE_CONFIG.labels.dataSourceNote}
              </p>

              {tableFooterBannerSrc && (
                <img
                  src={tableFooterBannerSrc}
                  alt="About the project"
                  style={{
                    display: 'block',
                    width: `${getPdfContentWidthMm()}mm`,
                    height: `${(getPdfContentWidthMm() * 1153) / 2480}mm`,
                    objectFit: 'cover',
                    marginTop: '4mm',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

PDFTemplate.displayName = 'PDFTemplate';
