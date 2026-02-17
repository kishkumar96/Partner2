'use client';

import { useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { Event, ExposureData, EconomicDamageData, Hazard, Sector } from '@/types';

// FIX: Lazy load heavy libraries only when export is triggered
// This reduces initial bundle size significantly

// PDF table column widths configuration (in mm)
const PDF_COL_WIDTHS = {
  EVENT: 45,
  DATE: 25,
  HAZARD: 25,
  SEVERITY: 20,
  POPULATION: 25,
  DAMAGE: 30,
} as const;

const PDF_COL_WIDTHS_ARRAY = [
  PDF_COL_WIDTHS.EVENT,
  PDF_COL_WIDTHS.DATE,
  PDF_COL_WIDTHS.HAZARD,
  PDF_COL_WIDTHS.SEVERITY,
  PDF_COL_WIDTHS.POPULATION,
  PDF_COL_WIDTHS.DAMAGE,
];

// Exposure table column widths configuration (in mm)
const EXPOSURE_COL_WIDTHS = {
  HAZARD: 35,
  SECTOR: 35,
  POPULATION: 30,
  ASSETS: 40,
  INFRASTRUCTURE: 30,
} as const;

const EXPOSURE_COL_WIDTHS_ARRAY = [
  EXPOSURE_COL_WIDTHS.HAZARD,
  EXPOSURE_COL_WIDTHS.SECTOR,
  EXPOSURE_COL_WIDTHS.POPULATION,
  EXPOSURE_COL_WIDTHS.ASSETS,
  EXPOSURE_COL_WIDTHS.INFRASTRUCTURE,
];

interface ExportButtonsProps {
  events: Event[];
  exposureData: ExposureData[];
  economicDamageData: EconomicDamageData[];
  hazards: Hazard[];
  sectors: Sector[];
  disabled?: boolean;
}

export default function ExportButtons({
  events,
  exposureData,
  economicDamageData,
  hazards,
  sectors,
  disabled = false,
}: ExportButtonsProps) {
  const [exportError, setExportError] = useState<string | null>(null);

  const getHazardName = (hazardId: string) =>
    hazards.find(h => h.id === hazardId)?.name || hazardId;

  const getSectorName = (sectorId: string) =>
    sectors.find(s => s.id === sectorId)?.name || sectorId;

  const downloadPDF = async () => {
    if (disabled) {
      setExportError('No data available to export');
      setTimeout(() => setExportError(null), 3000);
      return;
    }
    try {
      setExportError(null);
      // Lazy load jsPDF only when needed (explicitly disable prefetch)
      const { jsPDF } = await import(/* webpackPrefetch: false, webpackPreload: false */ 'jspdf');
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Title
      doc.setFontSize(20);
      doc.setTextColor(31, 41, 55);
      doc.text('Climate Risk Assessment Report', pageWidth / 2, 20, {
        align: 'center',
      });

      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, 28, {
        align: 'center',
      });

      // Summary Section
      let yPos = 45;
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text('Executive Summary', 15, yPos);

      yPos += 10;
      doc.setFontSize(10);
      doc.setTextColor(55, 65, 81);

      const totalEvents = events.length;
      const totalDamage = events.reduce((sum, e) => sum + (e.totalEconomicDamage || 0), 0);
      const totalPopulation = events.reduce((sum, e) => sum + (e.totalAffectedPopulation || 0), 0);

      doc.text(`Districts Assessed: ${totalEvents}`, 20, yPos);
      yPos += 7;
      doc.text(`Total Economic Damage: $${(totalDamage / 1000000).toFixed(1)}M`, 20, yPos);
      yPos += 7;
      doc.text(`Total Affected Population: ${totalPopulation.toLocaleString()}`, 20, yPos);

      // District Impacts Table
      yPos += 15;
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text('District Impact Assessment', 15, yPos);

      yPos += 10;
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);

      // Table headers
      const headers = ['District', 'Date', 'Hazard', 'Severity', 'Population', 'Damage'];
      let xPos = 15;

      headers.forEach((header, i) => {
        doc.text(header, xPos, yPos);
        xPos += PDF_COL_WIDTHS_ARRAY[i];
      });

      yPos += 5;
      doc.setDrawColor(200, 200, 200);
      doc.line(15, yPos, 185, yPos);
      yPos += 5;

      // Table rows - include all events with pagination
      doc.setTextColor(55, 65, 81);
      const pageHeight = doc.internal.pageSize.getHeight();

      events.forEach(event => {
        // Check if we need a new page
        if (yPos > pageHeight - 30) {
          doc.addPage();
          yPos = 20;
          doc.setFontSize(14);
          doc.setTextColor(31, 41, 55);
          doc.text('Event History (continued)', 15, yPos);
          yPos += 10;
          doc.setFontSize(8);
          doc.setTextColor(107, 114, 128);
          let headerXPos = 15;
          headers.forEach((header, i) => {
            doc.text(header, headerXPos, yPos);
            headerXPos += PDF_COL_WIDTHS_ARRAY[i];
          });
          yPos += 5;
          doc.line(15, yPos, 185, yPos);
          yPos += 5;
          doc.setTextColor(55, 65, 81);
        }
        xPos = 15;
        const row = [
          event.name.substring(0, 20),
          event.date,
          getHazardName(event.hazardId),
          event.severity,
          (event.totalAffectedPopulation || 0).toLocaleString(),
          `$${((event.totalEconomicDamage || 0) / 1000000).toFixed(1)}M`,
        ];

        row.forEach((cell, i) => {
          doc.text(cell, xPos, yPos);
          xPos += PDF_COL_WIDTHS_ARRAY[i];
        });
        yPos += 6;
      });

      // New page for exposure data
      doc.addPage();
      yPos = 20;

      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text('Exposure Analysis', 15, yPos);

      yPos += 10;
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);

      const expHeaders = ['Hazard', 'Sector', 'Population', 'Assets', 'Infrastructure'];
      xPos = 15;

      expHeaders.forEach((header, i) => {
        doc.text(header, xPos, yPos);
        xPos += EXPOSURE_COL_WIDTHS_ARRAY[i];
      });

      yPos += 5;
      doc.line(15, yPos, 185, yPos);
      yPos += 5;

      doc.setTextColor(55, 65, 81);
      exposureData.forEach(exp => {
        xPos = 15;
        const row = [
          getHazardName(exp.hazardId),
          getSectorName(exp.sectorId),
          exp.population.toLocaleString(),
          `$${(exp.assets / 1000000000).toFixed(1)}B`,
          exp.infrastructure.toLocaleString(),
        ];

        row.forEach((cell, i) => {
          doc.text(cell, xPos, yPos);
          xPos += EXPOSURE_COL_WIDTHS_ARRAY[i];
        });
        yPos += 6;
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text(`Page ${i} of ${pageCount} | Climate Risk Dashboard`, pageWidth / 2, 285, {
          align: 'center',
        });
      }

      doc.save('climate-risk-report.pdf');
    } catch (error) {
      console.error('PDF export failed:', error);
      setExportError('Failed to export PDF. Please try again.');
      setTimeout(() => setExportError(null), 5000);
    }
  };

  const downloadExcel = async () => {
    if (disabled) {
      setExportError('No data available to export');
      setTimeout(() => setExportError(null), 3000);
      return;
    }
    try {
      setExportError(null);
      // Lazy load ExcelJS and file-saver only when needed (explicitly disable prefetch)
      const ExcelJS = (await import(/* webpackPrefetch: false, webpackPreload: false */ 'exceljs'))
        .default;
      const { saveAs } = await import(
        /* webpackPrefetch: false, webpackPreload: false */ 'file-saver'
      );
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Climate Risk Dashboard';
      workbook.created = new Date();

      // Events Sheet
      const eventsSheet = workbook.addWorksheet('Events', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      eventsSheet.columns = [
        { header: 'Event Name', key: 'name', width: 30 },
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Hazard Type', key: 'hazard', width: 15 },
        { header: 'Severity', key: 'severity', width: 12 },
        { header: 'Affected Population', key: 'population', width: 18 },
        { header: 'Economic Damage ($)', key: 'damage', width: 20 },
        { header: 'Latitude', key: 'lat', width: 12 },
        { header: 'Longitude', key: 'lng', width: 12 },
      ];

      // Style header row
      eventsSheet.getRow(1).eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF3B82F6' },
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center' };
      });

      events.forEach(event => {
        eventsSheet.addRow({
          name: event.name,
          date: event.date,
          hazard: getHazardName(event.hazardId),
          severity: event.severity,
          population: event.totalAffectedPopulation || 0,
          damage: event.totalEconomicDamage || 0,
          lat: event.location.lat,
          lng: event.location.lng,
        });
      });

      // Exposure Sheet
      const exposureSheet = workbook.addWorksheet('Exposure Analysis', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      exposureSheet.columns = [
        { header: 'Hazard Type', key: 'hazard', width: 15 },
        { header: 'Sector', key: 'sector', width: 15 },
        { header: 'Population at Risk', key: 'population', width: 18 },
        { header: 'Assets at Risk ($)', key: 'assets', width: 20 },
        { header: 'Infrastructure Units', key: 'infrastructure', width: 18 },
      ];

      exposureSheet.getRow(1).eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF8B5CF6' },
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center' };
      });

      exposureData.forEach(exp => {
        exposureSheet.addRow({
          hazard: getHazardName(exp.hazardId),
          sector: getSectorName(exp.sectorId),
          population: exp.population,
          assets: exp.assets,
          infrastructure: exp.infrastructure,
        });
      });

      // Economic Damage Sheet
      const damageSheet = workbook.addWorksheet('Economic Damage', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      damageSheet.columns = [
        { header: 'Hazard Type', key: 'hazard', width: 15 },
        { header: 'Sector', key: 'sector', width: 15 },
        { header: 'Direct Loss ($)', key: 'direct', width: 18 },
        { header: 'Indirect Loss ($)', key: 'indirect', width: 18 },
        { header: 'Total Loss ($)', key: 'total', width: 18 },
        { header: 'Year', key: 'year', width: 10 },
      ];

      damageSheet.getRow(1).eachCell(cell => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEF4444' },
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center' };
      });

      economicDamageData.forEach(damage => {
        damageSheet.addRow({
          hazard: getHazardName(damage.hazardId),
          sector: getSectorName(damage.sectorId),
          direct: damage.directLoss,
          indirect: damage.indirectLoss,
          total: damage.totalLoss,
          year: damage.year,
        });
      });

      // Generate and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, 'climate-risk-data.xlsx');
    } catch (error) {
      console.error('Excel export failed:', error);
      setExportError('Failed to export Excel. Please try again.');
      setTimeout(() => setExportError(null), 5000);
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
        disabled={disabled}
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
        <span className="hidden sm:inline">Export</span> PDF
      </button>
      <button
        onClick={downloadExcel}
        disabled={disabled}
        aria-label="Export data as Excel spreadsheet"
        className={`group inline-flex items-center gap-2 px-3.5 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold text-white rounded-xl border transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
          disabled
            ? 'bg-slate-800/60 border-slate-700/60 text-slate-300 cursor-not-allowed opacity-60'
            : 'bg-gradient-to-br from-emerald-500/90 to-teal-600/90 border-emerald-300/30 shadow-[0_12px_28px_-14px_rgba(16,185,129,0.9)] hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-16px_rgba(16,185,129,1)] hover:border-emerald-200/60 focus-visible:ring-emerald-300/70'
        }`}
        title={disabled ? 'No data available to export' : 'Export as Excel'}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 border border-white/20 group-hover:bg-white/20 transition-colors">
          <FileSpreadsheet className="w-3.5 h-3.5" />
        </span>
        <span className="hidden sm:inline">Export</span> Excel
      </button>
    </div>
  );
}
