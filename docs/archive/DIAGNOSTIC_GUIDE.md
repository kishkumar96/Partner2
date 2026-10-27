# Regional Data Visualization Diagnostics

## 🔍 What Was Fixed

Added comprehensive console logging to track:
1. Country code propagation
2. Data loading (features, wind ranges)
3. Layer creation and visibility

## 🚀 How to Use

### Step 1: Start Development Server
```bash
npm run dev
```
Access: **http://localhost:3000/partner2/samoa** (or vanuatu, tonga, cook-islands)

### Step 2: Open Browser DevTools
- Press **F12** or **Ctrl+Shift+I**
- Go to **Console** tab
- Filter by "Regional" or "useRegional" to see diagnostic messages

### Step 3: Expected Console Output

When navigating to a country page, you should see:

```
🌍 [MapView] Selected country changed: WS
  → Independent State of Samoa (WS), center: [-172.1046,-13.759], zoom: 9

🌍 [useRegionalImpactsData] Loading data for country: WS (original: WS)
📊 [useRegionalImpactsData] Data loaded for WS:
  - features: 43
  - hasLossField: true
  - hasWindField: true
  - windRange: { min: 120, max: 200, count: 43 }
  - sampleWind: 165

🗺️ [RegionalImpactsLayer] Adding layers - Country: WS, Features: 43, Visible: true
➕ [RegionalImpactsLayer] Creating source with 43 features
🎨 [RegionalImpactsLayer] Creating fill layer - Style: loss, Opacity: 0.7
✅ [RegionalImpactsLayer] Layers setup complete - Fill: ✓, Line: ✓, Visibility: true
```

### Step 4: Toggle Wind/Loss View

Switch between "Economic Loss" and "Wind Intensity" in the controls. You should see:

```
🎨 [RegionalImpactsLayer] Creating fill layer - Style: wind, Opacity: 0.7
```

## 🐛 Troubleshooting

### Issue: No country-specific data logged
**Symptom**: Logs show `VU` (Vanuatu) instead of `WS`, `TO`, or `CK`
**Cause**: `selectedCountry` prop not being passed correctly
**Fix**: Check parent component prop passing

### Issue: Features = 0
**Symptom**: `Features: 0` in logs
**Cause**: GeoJSON file not loading
**Fix**: 
1. Check console for 404 errors
2. Verify file exists in `/public/{country}/regional-impacts.geojson`
3. Check file path casing (lowercase country codes)

### Issue: windRange shows { min: 0, max: 0, count: 0 }
**Symptom**: Wind data missing or all zeros
**Cause**: GeoJSON missing `Max_Wind_Gusts` field
**Fix**: Verify GeoJSON properties with:
```bash
cat public/samoa/regional-impacts.geojson | jq '.features[0].properties | keys'
```

### Issue: Layers not visible
**Symptom**: `Fill: ✗` or `Visibility: false` in logs
**Cause**: 
- Map style not loaded
- Layer removed during style change
- `visible` prop is false

**Fix**: 
1. Check for style.load events
2. Verify `styleChangeCounter` increments on basemap change
3. Check parent component's `visible` prop

## 📊 Verifying Data Files

### Check Samoa Data
```bash
# Count features
cat public/samoa/regional-impacts.geojson | jq '.features | length'
# Expected: 43

# Check wind data
cat public/samoa/regional-impacts.geojson | jq '[.features[].properties.Max_Wind_Gusts] | min, max'
# Expected: 120, 200
```

### Check Vanuatu Data
```bash
cat public/vanuatu/regional-impacts.geojson | jq '.features | length'
# Expected: some number > 0

cat public/vanuatu/regional-impacts.geojson | jq '[.features[].properties.Max_Wind_Gusts] | select(. != null) | min, max'
```

## 🔧 Production Docker Testing

When testing in Docker:

```bash
# Rebuild with diagnostics
./deploy-local.sh

# View real-time logs
docker logs -f partner2-prod

# Look for diagnostic messages in container logs
docker logs partner2-prod 2>&1 | grep "useRegionalImpactsData\|RegionalImpactsLayer"
```

**Note**: Console logs appear in browser DevTools, not container logs!

## ✅ Success Criteria

Data visualization is working if you see:
1. ✓ Country code matches URL (WS for /samoa, TO for /tonga, etc.)
2. ✓ Features > 0 loaded for that country
3. ✓ `windRange` shows non-zero min/max matching data file
4. ✓ Layers created successfully (Fill: ✓, Line: ✓)
5. ✓ Map shows colored regions when toggling wind/loss views

## 🆘 Still Not Working?

Share the following info:
1. Full console output from browser DevTools
2. Network tab showing any 404 or failed requests
3. Country you're testing (URL path)
4. Which view (wind vs loss) isn't showing data
