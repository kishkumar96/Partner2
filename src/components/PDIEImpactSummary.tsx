"use client";

import { useEffect, useState } from "react";
import { CountryCode } from "@/types/thredds";
import { loadPDIEOutputData } from "@/utils/geotiffLoader";
import { formatCurrency, formatNumber } from "@/utils/formatters";

interface PDIEImpactSummaryProps {
  countryCode: CountryCode;
}

export default function PDIEImpactSummary({ countryCode }: PDIEImpactSummaryProps) {
  const [sectorData, setSectorData] = useState<any[]>([]);
  const [assetData, setAssetData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [sectors, assets] = await Promise.all([
          loadPDIEOutputData(countryCode, 'sector-impact'),
          loadPDIEOutputData(countryCode, 'asset-impact'),
        ]);

        if (sectors) setSectorData(sectors);
        if (assets) setAssetData(assets);
      } catch (error) {
        console.error('Error loading PDIE summary data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [countryCode]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Loading Impact Data...</h3>
      </div>
    );
  }

  const totalLoss = sectorData.reduce((sum, row) => sum + parseFloat(row.Total_Loss || 0), 0);
  const totalExposed = sectorData.reduce((sum, row) => sum + parseFloat(row.Number_Exposed_Buildings || 0), 0);
  const totalDamaged = sectorData.reduce((sum, row) => sum + parseFloat(row.Number_Damaged_Buildings || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-red-500 to-red-600 text-white rounded-lg shadow-md p-6">
          <h3 className="text-sm font-medium opacity-90">Total Economic Loss</h3>
          <p className="text-3xl font-bold mt-2">{formatCurrency(totalLoss)}</p>
        </div>
        
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg shadow-md p-6">
          <h3 className="text-sm font-medium opacity-90">Buildings Exposed</h3>
          <p className="text-3xl font-bold mt-2">{formatNumber(totalExposed)}</p>
        </div>
        
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-lg shadow-md p-6">
          <h3 className="text-sm font-medium opacity-90">Buildings Damaged</h3>
          <p className="text-3xl font-bold mt-2">{formatNumber(totalDamaged)}</p>
        </div>
      </div>

      {/* Impact by Sector */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Impact by Sector</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Sector
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Total Loss
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Buildings Exposed
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Buildings Damaged
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sectorData.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {row.Sector}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(parseFloat(row.Total_Loss || 0))}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                    {formatNumber(parseFloat(row.Number_Exposed_Buildings || 0))}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                    {formatNumber(parseFloat(row.Number_Damaged_Buildings || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Impact by Asset Type */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Impact by Asset Type</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Asset Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Total Loss
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Number Exposed
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Number Damaged
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {assetData.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {row.Asset}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                    {formatCurrency(parseFloat(row.Total_Loss || 0))}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                    {formatNumber(parseFloat(row.Number_Exposed || 0))}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                    {formatNumber(parseFloat(row.Number_Damaged || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
