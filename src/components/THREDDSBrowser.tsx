"use client";

import { useState, useEffect } from "react";
import { Download, RefreshCw, FileText, Map, AlertCircle } from "lucide-react";
import { 
  fetchVanuatuTCLolaCatalog, 
  fetchCycloneTrack,
  buildFileUrl,
  THREDDSDataset 
} from "@/utils/threddsLoader";
import { CycloneTrack } from "@/types/thredds";

/**
 * THREDDS Data Browser Component
 * Allows users to browse and download real hazard data from THREDDS server
 */
export default function THREDDSBrowser() {
  const [datasets, setDatasets] = useState<THREDDSDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackData, setTrackData] = useState<CycloneTrack | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<THREDDSDataset | null>(null);

  // Load catalog on mount
  useEffect(() => {
    loadCatalog();
  }, []);

  async function loadCatalog() {
    setLoading(true);
    setError(null);
    
    try {
      const catalog = await fetchVanuatuTCLolaCatalog();
      setDatasets(catalog.datasets);
      
      // Auto-load first CSV track file if available
      const csvFile = catalog.datasets.find(d => d.type === 'csv');
      if (csvFile) {
        loadTrackData(csvFile.name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }

  async function loadTrackData(filename: string) {
    try {
      const track = await fetchCycloneTrack("VU", filename);
      setTrackData(track);
    } catch (err) {
      console.error("Error loading track:", err);
    }
  }

  function downloadDataset(dataset: THREDDSDataset) {
    const url = buildFileUrl("VU", "TC/Lola", dataset.name);
    window.open(url, '_blank');
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              THREDDS Data Browser
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              TC Lola - Vanuatu Hazard Data
            </p>
          </div>
        </div>
        <button
          onClick={loadCatalog}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Error loading data
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-500">Loading catalog...</p>
          </div>
        </div>
      )}

      {/* Datasets List */}
      {!loading && datasets.length > 0 && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Files</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {datasets.length}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">NetCDF Files</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {datasets.filter(d => d.type === 'nc').length}
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">GeoTIFF Files</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {datasets.filter(d => d.type === 'tif').length}
              </p>
            </div>
          </div>

          {/* Dataset Table */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Dataset Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {datasets.map((dataset, index) => (
                  <tr 
                    key={index}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                      selectedDataset?.name === dataset.name ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {dataset.type === 'nc' && <Map className="w-4 h-4 text-blue-500" />}
                        {dataset.type === 'tif' && <Map className="w-4 h-4 text-green-500" />}
                        {dataset.type === 'csv' && <FileText className="w-4 h-4 text-purple-500" />}
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
                          {dataset.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase ${
                        dataset.type === 'nc' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                        dataset.type === 'tif' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        dataset.type === 'csv' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}>
                        {dataset.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {dataset.size}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => downloadDataset(dataset)}
                        className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Track Data Preview */}
          {trackData && trackData.features.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                🌀 Cyclone Track Loaded
              </h3>
              <div className="text-sm text-blue-800 dark:text-blue-300">
                <p>Name: {trackData.features[0]?.properties?.name || "TC Lola"}</p>
                <p>Track Points: {trackData.features[0]?.geometry?.coordinates?.length || 0}</p>
                <p>Type: {trackData.features[0]?.geometry?.type}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && datasets.length === 0 && !error && (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            No datasets found. Try refreshing the catalog.
          </p>
        </div>
      )}
    </div>
  );
}
