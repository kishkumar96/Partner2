# Quick Test Guide - ERR_INCOMPLETE_CHUNKED_ENCODING Fix

## ✅ What Was Fixed

1. **Increased timeout**: 30s → 120s for Vanuatu's 9.1MB file
2. **Progressive loading**: Small countries appear first (1-2s), Vanuatu loads separately
3. **Better retries**: 2 → 3 attempts with longer delays
4. **Compression headers**: Request gzip/brotli encoding
5. **Error detection**: Special handling for chunked encoding failures

---

## 🧪 Testing Steps

### 1. **Start Dev Server**
```bash
cd /home/kishank/Partner2
npm run dev
```

### 2. **Open Browser with DevTools**
```bash
http://localhost:3000/vanuatu
```

**Open:** DevTools (F12) → Console tab

### 3. **Watch Console Messages**

You should see:
```
🌍 [loadAllCountriesRegionalImpacts] Loading small countries first...
[loadRegionalImpacts] Loading WS (~500KB) with 60000ms timeout
[loadRegionalImpacts] Loading CK (~500KB) with 60000ms timeout
[loadRegionalImpacts] Loading TO (~500KB) with 60000ms timeout
✅ Loaded 45 regions for WS
✅ Loaded 42 regions for CK
✅ Loaded 38 regions for TO
✅ Loaded 125 regions from 3 small countries

🌍 Loading Vanuatu (9.1MB) - this may take 30-60 seconds...
[loadRegionalImpacts] Loading VU (9.1MB) with 120000ms timeout
[DataLoader] Loading /vanuatu/regional-impacts.geojson: 9.12MB
✅ Loaded 66 regions for VU
🎉 Combined 191 total regions from 4 countries
```

### 4. **Check Network Tab**

**Open:** DevTools → Network tab → Filter by "geojson"

**Look for:**
- `regional-impacts.geojson` files loading
- **Status:** All should be `200 OK` (not canceled or error)
- **Time:** Vanuatu should complete within 120 seconds
- **Transfer Size:** Should show compressed size (1-2MB) if compression works

---

## 🎯 Success Criteria

✅ **No `ERR_INCOMPLETE_CHUNKED_ENCODING` errors**  
✅ **Small countries (Samoa, Tonga, Cook Islands) appear within 2 seconds**  
✅ **Vanuatu appears within 60 seconds (120 max)**  
✅ **All 191 regions displayed on map**  
✅ **Console shows "Combined 191 total regions from 4 countries"**

---

## 🐛 If Still Failing

### Error: "Request timeout" after 120s

**Solution 1:** Simplify Vanuatu GeoJSON (reduce file size)
```bash
# Install mapshaper
npm install -g mapshaper

# Simplify geometry
mapshaper public/vanuatu/regional-impacts.geojson \
  -simplify 20% \
  -o public/vanuatu/regional-impacts.geojson

# Should reduce from 9.1MB to ~1.8MB
```

**Solution 2:** Increase timeout further
```typescript
// src/utils/realDataLoader.ts
const timeoutDuration = isLargeFile ? 180000 : 60000; // 3 minutes
```

### Error: "net::ERR_FAILED" or "net::ERR_CONNECTION_RESET"

**Cause:** Server crashed or ran out of memory  
**Solution:** Check server logs, restart dev server

### Error: Files still showing 9.1MB transfer (not compressed)

**Cause:** Compression not enabled  
**Solution:** Test in production mode:
```bash
npm run build
npm start
# Open http://localhost:3000/vanuatu
```

---

## 📊 Performance Expectations

| Metric | Target | Acceptable | Bad |
|--------|--------|-----------|-----|
| Small countries visible | <2s | <5s | >5s |
| Vanuatu visible | <60s | <120s | >120s |
| First render | <2s | <3s | >5s |
| ERR_INCOMPLETE errors | 0 | 1-2 (then retry succeeds) | >3 |

---

## 🔍 Advanced Debugging

### Check actual file sizes:
```bash
ls -lh public/vanuatu/regional-impacts.geojson
ls -lh public/samoa/regional-impacts.geojson
ls -lh public/tonga/regional-impacts*.geojson
ls -lh public/cook-islands/regional-impacts.geojson
```

### Watch network speed:
```bash
# Test download speed
curl -w "Speed: %{speed_download} bytes/sec\\n" \
  -o /dev/null \
  http://localhost:3000/vanuatu/regional-impacts.geojson
```

### Check compression:
```bash
# Test with compression
curl -H "Accept-Encoding: gzip" \
  -I \
  http://localhost:3000/vanuatu/regional-impacts.geojson

# Look for: Content-Encoding: gzip
```

---

## 📝 What to Report

If still having issues, provide:

1. **Console output** (copy all messages)
2. **Network tab screenshot** showing the failed request
3. **File sizes** from `ls -lh public/*/regional-impacts*.geojson`
4. **Error message** (exact text)
5. **Connection speed** (Fast 3G, Slow 3G, WiFi, etc.)

---

## ✨ Expected User Experience

**Before fix:**
- Blank map for 5-8 seconds
- Then all data appears at once
- Frequent timeout errors

**After fix:**
- Samoa, Tonga, Cook Islands appear in 1-2 seconds ⚡
- User can interact with 75% of data immediately
- Vanuatu appears 30-60 seconds later
- Smooth progressive experience
- No timeout errors

---

## 🚀 Next Steps

If this fix works well, consider:

1. **Use Database API** (90% smaller payload)
2. **Simplify geometries** (80% smaller files)
3. **Implement viewport loading** (only load visible countries)

See `PERFORMANCE_MULTI_COUNTRY_LOADING.md` for details.
