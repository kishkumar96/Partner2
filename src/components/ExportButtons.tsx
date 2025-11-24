"use client";

import { jsPDF } from "jspdf";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Event, ExposureData, EconomicDamageData, Hazard, Sector } from "@/types";

interface ExportButtonsProps {
  events: Event[];
  exposureData: ExposureData[];
  economicDamageData: EconomicDamageData[];
  hazards: Hazard[];
  sectors: Sector[];
}

export default function ExportButtons({
  events,
  exposureData,
  economicDamageData,
  hazards,
  sectors,
}: ExportButtonsProps) {
  const getHazardName = (hazardId: string) =>
    hazards.find((h) => h.id === hazardId)?.name || hazardId;

  const getSectorName = (sectorId: string) =>
    sectors.find((s) => s.id === sectorId)?.name || sectorId;

  const downloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(20);
    doc.setTextColor(31, 41, 55);
    doc.text("Climate Risk Assessment Report", pageWidth / 2, 20, {
      align: "center",
    });

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(
      `Generated on ${new Date().toLocaleDateString()}`,
      pageWidth / 2,
      28,
      { align: "center" }
    );

    // Summary Section
    let yPos = 45;
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text("Executive Summary", 15, yPos);

    yPos += 10;
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);

    const totalEvents = events.length;
    const totalDamage = events.reduce((sum, e) => sum + e.economicDamage, 0);
    const totalPopulation = events.reduce(
      (sum, e) => sum + e.affectedPopulation,
      0
    );

    doc.text(`Total Events Recorded: ${totalEvents}`, 20, yPos);
    yPos += 7;
    doc.text(
      `Total Economic Damage: $${(totalDamage / 1000000).toFixed(1)}M`,
      20,
      yPos
    );
    yPos += 7;
    doc.text(
      `Total Affected Population: ${totalPopulation.toLocaleString()}`,
      20,
      yPos
    );

    // Events Table
    yPos += 15;
    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text("Event History", 15, yPos);

    yPos += 10;
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);

    // Table headers
    const headers = ["Event", "Date", "Hazard", "Severity", "Population", "Damage"];
    const colWidths = [45, 25, 25, 20, 25, 30];
    let xPos = 15;

    headers.forEach((header, i) => {
      doc.text(header, xPos, yPos);
      xPos += colWidths[i];
    });

    yPos += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(15, yPos, 185, yPos);
    yPos += 5;

    // Table rows
    doc.setTextColor(55, 65, 81);
    events.slice(0, 10).forEach((event) => {
      xPos = 15;
      const row = [
        event.name.substring(0, 20),
        event.date,
        getHazardName(event.hazardId),
        event.severity,
        event.affectedPopulation.toLocaleString(),
        `$${(event.economicDamage / 1000000).toFixed(1)}M`,
      ];

      row.forEach((cell, i) => {
        doc.text(cell, xPos, yPos);
        xPos += colWidths[i];
      });
      yPos += 6;
    });

    // New page for exposure data
    doc.addPage();
    yPos = 20;

    doc.setFontSize(14);
    doc.setTextColor(31, 41, 55);
    doc.text("Exposure Analysis", 15, yPos);

    yPos += 10;
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);

    const expHeaders = ["Hazard", "Sector", "Population", "Assets", "Infrastructure"];
    const expColWidths = [35, 35, 30, 40, 30];
    xPos = 15;

    expHeaders.forEach((header, i) => {
      doc.text(header, xPos, yPos);
      xPos += expColWidths[i];
    });

    yPos += 5;
    doc.line(15, yPos, 185, yPos);
    yPos += 5;

    doc.setTextColor(55, 65, 81);
    exposureData.forEach((exp) => {
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
        xPos += expColWidths[i];
      });
      yPos += 6;
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `Page ${i} of ${pageCount} | Climate Risk Dashboard`,
        pageWidth / 2,
        285,
        { align: "center" }
      );
    }

    doc.save("climate-risk-report.pdf");
  };

  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Climate Risk Dashboard";
    workbook.created = new Date();

    // Events Sheet
    const eventsSheet = workbook.addWorksheet("Events", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    eventsSheet.columns = [
      { header: "Event Name", key: "name", width: 30 },
      { header: "Date", key: "date", width: 15 },
      { header: "Hazard Type", key: "hazard", width: 15 },
      { header: "Severity", key: "severity", width: 12 },
      { header: "Affected Population", key: "population", width: 18 },
      { header: "Economic Damage ($)", key: "damage", width: 20 },
      { header: "Latitude", key: "lat", width: 12 },
      { header: "Longitude", key: "lng", width: 12 },
    ];

    // Style header row
    eventsSheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF3B82F6" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center" };
    });

    events.forEach((event) => {
      eventsSheet.addRow({
        name: event.name,
        date: event.date,
        hazard: getHazardName(event.hazardId),
        severity: event.severity,
        population: event.affectedPopulation,
        damage: event.economicDamage,
        lat: event.location.lat,
        lng: event.location.lng,
      });
    });

    // Exposure Sheet
    const exposureSheet = workbook.addWorksheet("Exposure Analysis", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    exposureSheet.columns = [
      { header: "Hazard Type", key: "hazard", width: 15 },
      { header: "Sector", key: "sector", width: 15 },
      { header: "Population at Risk", key: "population", width: 18 },
      { header: "Assets at Risk ($)", key: "assets", width: 20 },
      { header: "Infrastructure Units", key: "infrastructure", width: 18 },
    ];

    exposureSheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF8B5CF6" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center" };
    });

    exposureData.forEach((exp) => {
      exposureSheet.addRow({
        hazard: getHazardName(exp.hazardId),
        sector: getSectorName(exp.sectorId),
        population: exp.population,
        assets: exp.assets,
        infrastructure: exp.infrastructure,
      });
    });

    // Economic Damage Sheet
    const damageSheet = workbook.addWorksheet("Economic Damage", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    damageSheet.columns = [
      { header: "Hazard Type", key: "hazard", width: 15 },
      { header: "Sector", key: "sector", width: 15 },
      { header: "Direct Loss ($)", key: "direct", width: 18 },
      { header: "Indirect Loss ($)", key: "indirect", width: 18 },
      { header: "Total Loss ($)", key: "total", width: 18 },
      { header: "Year", key: "year", width: 10 },
    ];

    damageSheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEF4444" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center" };
    });

    economicDamageData.forEach((damage) => {
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
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, "climate-risk-data.xlsx");
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={downloadPDF}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        Export PDF
      </button>
      <button
        onClick={downloadExcel}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg shadow-sm transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        Export Excel
      </button>
    </div>
  );
}
