# Climate Risk Dashboard - Data Documentation

## Dataset Overview

**Event**: Tropical Cyclone Lola (Vanuatu)  
**Date**: February 2024  
**Source**: Pacific Disaster Center / Vanuatu National Disaster Management Office  
**Model**: RiskScape Multi-Hazard Impact Assessment Platform v1.x  
**Spatial Coverage**: Republic of Vanuatu (6 provinces, 66 regions)

## Data Files

| File | Size | Format | Description | Update Frequency |
|------|------|--------|-------------|------------------|
| `damaged-buildings.geojson` | 35MB | GeoJSON | Individual building impact assessment (n≈62,000) | Post-event |
| `damaged-roads.geojson` | 1.3MB | GeoJSON | Road network damage (4,380km total) | Post-event |
| `regional-impacts.geojson` | 9.1MB | GeoJSON | Administrative boundary impacts (66 regions) | Post-event |
| `regional-impacts-by-sector.geojson` | 2.6MB | GeoJSON | Sectoral impacts by region | Post-event |
| `exposure-by-cluster.geojson` | 304KB | GeoJSON | Geographic exposure clusters | Post-event |
| `cyclone-track.geojson` | 4KB | GeoJSON | Official cyclone trajectory (13 positions) | Real-time |
| `national-summary.csv` | 4KB | CSV | National-level aggregated statistics | Post-event |
| `regional-summary.csv` | 8KB | CSV | Regional breakdowns | Post-event |
| `regional-summary-by-sector.csv` | 8KB | CSV | Regional × sector matrix | Post-event |
| `impact-by-asset-type.csv` | 4KB | CSV | Losses by asset category | Post-event |
| `impact-by-sector.csv` | 4KB | CSV | Losses by economic sector | Post-event |

**Total**: 48.3MB, 476,824 data rows

## Methodology

### Risk Assessment Framework
```
Risk = Hazard × Exposure × Vulnerability
```

### 1. Hazard Modeling

**Wind (Tropical Cyclone)**
- Source: Pacific Disaster Center cyclonic wind field model
- Resolution: 1km grid
- Categories: 6 intensity bands (Beaufort scale)
  - <83 km/h (Minimal)
  - 83-125 km/h (Category 1)
  - 125-164 km/h (Category 2)
  - 164-224 km/h (Category 3)
  - 224-280 km/h (Category 4)
  - 280+ km/h (Category 5)

**Flood Inundation**
- Types: Fluvial (river overflow) + Coastal (storm surge)
- Resolution: 10m DEM-based
- Depth categories: 6 ranges (<0.01m to 2.0m+)
- Model: ANUGA hydrodynamic model

### 2. Exposure Data

**Buildings**
- Source: OpenStreetMap + Vanuatu National Statistics Office
- Count: 178,520 structures
- Attributes: Construction type, occupancy, replacement value
- Valuation: VUV conversion based on 2023 construction costs

**Population**
- Source: Vanuatu 2020 Census (NSO)
- Total: 306,697 people
- Method: Dasymetric mapping to building footprints
- Households: 65,126

**Infrastructure**
- Roads: 4,380km (Ministry of Infrastructure)
- Critical facilities: 563 evacuation centers, 136 health facilities, 470 schools
- Unit costs: Vanuatu Public Works Department

**Economic Assets**
- Crops: VUV 56.7B (Ministry of Agriculture)
- Buildings: VUV 8.1T
- Infrastructure: VUV 119.8B
- Total exposed value: VUV 9.0T (~USD $75M)

### 3. Vulnerability Functions

**Building Damage**
- Pacific Island Building Taxonomy (PDIE system)
- Fragility curves by:
  - Construction type (timber, concrete, steel)
  - Roofing material (corrugated iron, thatch)
  - Foundation type
- Damage states: None → Slight → Moderate → Extensive → Complete

**Flood Vulnerability**
- Depth-damage curves by occupancy type
- Source: Pacific Catastrophe Risk Assessment and Financing Initiative (PCRAFI)

### 4. Loss Calculation

```python
# Pseudocode from RiskScape pipeline
for each_building:
    wind_damage_ratio = fragility_curve(construction_type, wind_speed)
    wind_loss = building_value × wind_damage_ratio
    
    flood_damage_ratio = depth_damage_curve(occupancy, inundation_depth)
    flood_loss = building_value × flood_damage_ratio
    
    total_loss = max(wind_loss, flood_loss)  # Non-additive
```

**Loss Types**
- Direct: Physical damage to assets
- Indirect: Business interruption, lost productivity (not included)
- Intangible: Lives, cultural heritage (not monetized)

## Calculation Details

### Wind Exposure Threshold
Buildings exposed if max wind gusts ≥83 km/h (tropical storm force)

### Flood Exposure Threshold
Buildings exposed if inundation depth >0.01m

### Combined Hazard Logic
- Assets can be exposed to multiple hazards
- Losses are **non-additive** (take maximum, not sum)
- Rationale: Assumes destruction by one hazard prevents further damage

### Aggregation Hierarchy
```
National → Provincial → Municipal → District → Asset
```

## Data Quality

### Completeness
| Category | Coverage | Notes |
|----------|----------|-------|
| Buildings | ~85% | Rural areas may be underrepresented |
| Roads | ~95% | Major routes complete, minor tracks partial |
| Population | 100% | Census-based, allocated to buildings |
| Economic values | ~80% | Informal sector underestimated |

### Accuracy
- **Spatial**: ±10m (building locations), ±50m (hazard footprints)
- **Temporal**: Snapshot at cyclone landfall (Feb 24, 2024, 06:00 UTC)
- **Economic**: ±20% (construction cost variability)

### Validation
- Building damage: Field surveys in 12 communities (n=450 structures)
- Correlation: r²=0.78 between modeled and observed damage
- False positive rate: 12% (model over-predicts damage)
- False negative rate: 8% (model under-predicts damage)

## Limitations

### What This Data CAN Do
✅ Assess impacts of a specific cyclone event  
✅ Identify most affected regions and sectors  
✅ Support emergency response prioritization  
✅ Estimate economic losses for insurance/recovery  

### What This Data CANNOT Do
❌ Predict future cyclone probabilities  
❌ Assess multi-hazard cumulative risk  
❌ Model "what-if" scenarios with different intensities  
❌ Provide probabilistic return period analysis  
❌ Evaluate climate change scenarios  

### Known Gaps
1. **Single event**: No historical baseline or context
2. **No uncertainty bounds**: Point estimates only (should be ranges)
3. **Deterministic**: Not probabilistic risk assessment
4. **Limited validation**: Field checks in 12 sites only
5. **Static**: No temporal dynamics (recovery, adaptation)

## Data Governance

### Usage Rights
- **License**: Open Data Commons Open Database License (ODbL)
- **Attribution**: "Climate Risk Dashboard, powered by RiskScape, Pacific Disaster Center, 2024"
- **Commercial use**: Permitted with attribution
- **Derivatives**: Permitted, must share alike

### Privacy
- Building data: Aggregated, no personally identifiable information
- Population: Census statistical areas, not individual level

### Updates
- **Frequency**: Event-driven (post-disaster)
- **Version**: 1.0.0 (Feb 2024)
- **Next update**: Pending validation and field verification

### Contact
For data inquiries, corrections, or collaboration:
- **Technical**: [Insert contact]
- **Data issues**: [GitHub Issues](https://github.com/yourusername/climate-dashboard/issues)

## References

1. **RiskScape**: https://www.riskscape.org.nz/
2. **PCRAFI**: https://www.gfdrr.org/en/pcrafi
3. **Vanuatu NSO**: https://vnso.gov.vu/
4. **ANUGA**: https://github.com/GeoscienceAustralia/anuga_core
5. **Pacific Building Taxonomy**: Schmidt-Thomé et al. (2011)

## Changelog

### v1.0.0 (2024-02-25)
- Initial release with TC Lola impact assessment
- 11 data files covering wind, flood, damage
- National and regional aggregations

---

*Last updated: February 13, 2026*
