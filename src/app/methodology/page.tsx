"use client";

import { useState } from "react";
import {
  BookOpen,
  Database,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  TrendingUp,
  Shield,
  Calendar,
} from "lucide-react";

export default function MethodologyPage() {
  const [activeSection, setActiveSection] = useState("overview");

  const sections = [
    { id: "overview", label: "Overview", icon: BookOpen },
    { id: "data", label: "Data Files", icon: Database },
    { id: "methodology", label: "Methodology", icon: Activity },
    { id: "quality", label: "Data Quality", icon: CheckCircle },
    { id: "limitations", label: "Limitations", icon: AlertTriangle },
    { id: "governance", label: "Governance", icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Data Documentation & Methodology
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Comprehensive documentation of data sources, modeling methodology, and
            quality assurance for the Climate Risk Dashboard
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium">
              TC Lola • February 2024
            </span>
            <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm font-medium">
              RiskScape v1.x
            </span>
            <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm font-medium">
              48.3MB Dataset
            </span>
            <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 rounded-full text-sm font-medium">
              476,824 Rows
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Navigation Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 sticky top-6">
              <nav className="space-y-1">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        activeSection === section.id
                          ? "bg-blue-600 text-white"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{section.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content Area */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
              {activeSection === "overview" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                      Dataset Overview
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">
                          Event
                        </div>
                        <div className="font-bold text-gray-900 dark:text-white">
                          Tropical Cyclone Lola
                        </div>
                      </div>
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="text-sm text-green-600 dark:text-green-400 mb-1">
                          Date
                        </div>
                        <div className="font-bold text-gray-900 dark:text-white">
                          February 2024
                        </div>
                      </div>
                      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">
                          Location
                        </div>
                        <div className="font-bold text-gray-900 dark:text-white">
                          Republic of Vanuatu
                        </div>
                      </div>
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">
                          Model
                        </div>
                        <div className="font-bold text-gray-900 dark:text-white">
                          RiskScape v1.x
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                      Spatial Coverage
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                      6 provinces, 66 regions across the Republic of Vanuatu
                    </p>
                    <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                      <li>• ~62,000 individual buildings assessed</li>
                      <li>• 4,380km of road network</li>
                      <li>• 306,697 total population</li>
                      <li>• 65,126 households</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border-l-4 border-amber-500">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <div className="font-bold text-amber-900 dark:text-amber-100 mb-1">
                          Single Event Dataset
                        </div>
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          This dashboard visualizes a single cyclone event. It cannot
                          predict future events, assess multi-hazard cumulative risk, or
                          provide probabilistic return period analysis.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "data" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Data Files
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">
                            File
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">
                            Size
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">
                            Format
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-gray-900 dark:text-white">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {[
                          {
                            file: "damaged-buildings.geojson",
                            size: "35MB",
                            format: "GeoJSON",
                            desc: "Individual building impacts (n≈62,000)",
                          },
                          {
                            file: "damaged-roads.geojson",
                            size: "1.3MB",
                            format: "GeoJSON",
                            desc: "Road network damage (4,380km)",
                          },
                          {
                            file: "regional-impacts.geojson",
                            size: "9.1MB",
                            format: "GeoJSON",
                            desc: "Administrative boundary impacts (66 regions)",
                          },
                          {
                            file: "regional-impacts-by-sector.geojson",
                            size: "2.6MB",
                            format: "GeoJSON",
                            desc: "Sectoral impacts by region",
                          },
                          {
                            file: "exposure-by-cluster.geojson",
                            size: "304KB",
                            format: "GeoJSON",
                            desc: "Geographic exposure clusters",
                          },
                          {
                            file: "cyclone-track.geojson",
                            size: "4KB",
                            format: "GeoJSON",
                            desc: "Official cyclone trajectory",
                          },
                          {
                            file: "national-summary.csv",
                            size: "4KB",
                            format: "CSV",
                            desc: "National-level statistics",
                          },
                          {
                            file: "impact-by-sector.csv",
                            size: "4KB",
                            format: "CSV",
                            desc: "Losses by economic sector",
                          },
                        ].map((row) => (
                          <tr key={row.file} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="px-4 py-3 font-mono text-xs text-gray-900 dark:text-white">
                              {row.file}
                            </td>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                              {row.size}
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs font-medium">
                                {row.format}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                              {row.desc}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSection === "methodology" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Risk Assessment Framework
                  </h2>

                  <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                    <div className="text-center text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      Risk = Hazard × Exposure × Vulnerability
                    </div>
                    <p className="text-center text-gray-600 dark:text-gray-400">
                      Industry-standard multi-hazard risk assessment methodology
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                        1. Hazard Modeling
                      </h3>
                      <div className="space-y-2 text-gray-700 dark:text-gray-300">
                        <p>
                          <strong>Wind (Tropical Cyclone):</strong> Pacific Disaster Center
                          cyclonic wind field model, 1km resolution
                        </p>
                        <ul className="ml-4 space-y-1">
                          <li>• 6 intensity bands (Beaufort scale)</li>
                          <li>• Categories 1-5 (83-280+ km/h)</li>
                        </ul>
                        <p className="mt-2">
                          <strong>Flood Inundation:</strong> ANUGA hydrodynamic model,
                          10m DEM-based
                        </p>
                        <ul className="ml-4 space-y-1">
                          <li>• Fluvial (river overflow) + Coastal (storm surge)</li>
                          <li>• 6 depth categories (&lt;0.01m to 2.0m+)</li>
                        </ul>
                      </div>
                    </div>

                    <div className="p-4 border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                        2. Exposure Data
                      </h3>
                      <div className="space-y-2 text-gray-700 dark:text-gray-300">
                        <p>
                          <strong>Buildings:</strong> 178,520 structures from OpenStreetMap
                          + Vanuatu NSO
                        </p>
                        <p>
                          <strong>Population:</strong> 306,697 people (2020 Census,
                          dasymetric mapping)
                        </p>
                        <p>
                          <strong>Infrastructure:</strong> Roads (4,380km), 563 evacuation
                          centers, 136 health facilities, 470 schools
                        </p>
                        <p>
                          <strong>Economic Assets:</strong> VUV 9.0T (~USD $75M) total
                          value
                        </p>
                      </div>
                    </div>

                    <div className="p-4 border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-900/20">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                        3. Vulnerability Functions
                      </h3>
                      <div className="space-y-2 text-gray-700 dark:text-gray-300">
                        <p>
                          <strong>Building Damage:</strong> Pacific Island Building
                          Taxonomy (PDIE system)
                        </p>
                        <ul className="ml-4 space-y-1">
                          <li>• Fragility curves by construction type and roofing</li>
                          <li>
                            • Damage states: None → Slight → Moderate → Extensive →
                            Complete
                          </li>
                        </ul>
                        <p className="mt-2">
                          <strong>Flood Vulnerability:</strong> Depth-damage curves from
                          PCRAFI
                        </p>
                      </div>
                    </div>

                    <div className="p-4 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                        4. Loss Calculation
                      </h3>
                      <div className="bg-gray-900 dark:bg-gray-950 p-4 rounded mt-2 overflow-x-auto">
                        <pre className="text-sm text-green-400">
                          {`for each_building:
    wind_damage_ratio = fragility_curve(type, wind_speed)
    wind_loss = building_value × wind_damage_ratio
    
    flood_damage_ratio = depth_damage_curve(occupancy, depth)
    flood_loss = building_value × flood_damage_ratio
    
    total_loss = max(wind_loss, flood_loss)  # Non-additive`}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "quality" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Data Quality Assessment
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <h3 className="font-bold text-gray-900 dark:text-white">
                          Completeness
                        </h3>
                      </div>
                      <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                        <li>• Buildings: ~85% coverage</li>
                        <li>• Roads: ~95% coverage</li>
                        <li>• Population: 100% (census-based)</li>
                        <li>• Economic values: ~80%</li>
                      </ul>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-gray-900 dark:text-white">
                          Accuracy
                        </h3>
                      </div>
                      <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                        <li>• Spatial: ±10m (buildings)</li>
                        <li>• Hazard footprints: ±50m</li>
                        <li>• Economic: ±20%</li>
                        <li>• Temporal: Landfall snapshot</li>
                      </ul>
                    </div>
                  </div>

                  <div className="p-6 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-3">
                      Validation Results
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                          r² = 0.78
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          Model-Observed Correlation
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                          12%
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          False Positive Rate
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                          8%
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          False Negative Rate
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-3">
                      Field surveys conducted in 12 communities (n=450 structures) to
                      validate modeled damage against observed damage.
                    </p>
                  </div>
                </div>
              )}

              {activeSection === "limitations" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Limitations & Capabilities
                  </h2>

                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border-l-4 border-green-500">
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                          What This Data CAN Do
                        </h3>
                        <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                          <li>Assess impacts of TC Lola specifically</li>
                          <li>Identify most affected regions and sectors</li>
                          <li>Support emergency response prioritization</li>
                          <li>Estimate economic losses for insurance/recovery</li>
                          <li>Visualize spatial distribution of damage</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border-l-4 border-red-500">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                          What This Data CANNOT Do
                        </h3>
                        <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                          <li>Predict future cyclone probabilities</li>
                          <li>Assess multi-hazard cumulative risk</li>
                          <li>Model "what-if" scenarios with different intensities</li>
                          <li>Provide probabilistic return period analysis</li>
                          <li>Evaluate climate change scenarios</li>
                          <li>Track temporal recovery dynamics</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                      Known Gaps
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        {
                          title: "Single Event",
                          desc: "No historical baseline or context",
                        },
                        {
                          title: "No Uncertainty",
                          desc: "Point estimates only (should be ranges)",
                        },
                        {
                          title: "Deterministic",
                          desc: "Not probabilistic risk assessment",
                        },
                        {
                          title: "Limited Validation",
                          desc: "Field checks in 12 sites only",
                        },
                        {
                          title: "Static Snapshot",
                          desc: "No temporal dynamics or recovery modeling",
                        },
                        {
                          title: "Rural Undercount",
                          desc: "Remote areas may be underrepresented",
                        },
                      ].map((gap) => (
                        <div
                          key={gap.title}
                          className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                        >
                          <div className="font-semibold text-gray-900 dark:text-white text-sm">
                            {gap.title}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {gap.desc}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "governance" && (
                <div className="space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    Data Governance
                  </h2>

                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                      Usage Rights
                    </h3>
                    <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                      <li>
                        <strong>License:</strong> Open Data Commons Open Database License
                        (ODbL)
                      </li>
                      <li>
                        <strong>Attribution:</strong> "Climate Risk Dashboard, powered by
                        RiskScape, Pacific Disaster Center, 2024"
                      </li>
                      <li>
                        <strong>Commercial use:</strong> Permitted with attribution
                      </li>
                      <li>
                        <strong>Derivatives:</strong> Permitted, must share alike
                      </li>
                    </ul>
                  </div>

                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                      Privacy & Security
                    </h3>
                    <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                      <li>
                        • Building data: Aggregated, no personally identifiable information
                      </li>
                      <li>
                        • Population: Census statistical areas, not individual level
                      </li>
                      <li>• All data is public and anonymized</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Updates & Versioning
                    </h3>
                    <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                      <li>
                        <strong>Frequency:</strong> Event-driven (post-disaster)
                      </li>
                      <li>
                        <strong>Current version:</strong> 1.0.0 (Feb 2024)
                      </li>
                      <li>
                        <strong>Next update:</strong> Pending validation and field
                        verification
                      </li>
                    </ul>
                  </div>

                  <div className="p-4 border border-gray-300 dark:border-gray-600 rounded-lg">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-3">
                      References
                    </h3>
                    <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      <li>
                        1. <strong>RiskScape:</strong>{" "}
                        <a
                          href="https://www.riskscape.org.nz/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          https://www.riskscape.org.nz/
                        </a>
                      </li>
                      <li>
                        2. <strong>PCRAFI:</strong>{" "}
                        <a
                          href="https://www.gfdrr.org/en/pcrafi"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          https://www.gfdrr.org/en/pcrafi
                        </a>
                      </li>
                      <li>
                        3. <strong>Vanuatu NSO:</strong>{" "}
                        <a
                          href="https://vnso.gov.vu/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          https://vnso.gov.vu/
                        </a>
                      </li>
                      <li>
                        4. <strong>ANUGA:</strong>{" "}
                        <a
                          href="https://github.com/GeoscienceAustralia/anuga_core"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          https://github.com/GeoscienceAustralia/anuga_core
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">
                      Changelog
                    </h3>
                    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      <div>
                        <strong>v1.0.0 (2024-02-25)</strong>
                        <ul className="ml-4 mt-1 space-y-1">
                          <li>• Initial release with TC Lola impact assessment</li>
                          <li>• 11 data files covering wind, flood, damage</li>
                          <li>• National and regional aggregations</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
