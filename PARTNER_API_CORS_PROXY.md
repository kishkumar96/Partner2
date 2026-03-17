# Partner API CORS Proxy

## Problem

The Partner API at `https://opmthredds.gem.spc.int/partner_api/v1/` does not include CORS headers (`Access-Control-Allow-Origin`), which causes browsers to block fetch requests from the Climate Dashboard frontend.

## Solution

A Next.js API route proxy (`/api/partner-proxy/[...path]`) acts as a middleware layer that:

1. Receives requests from the frontend (same-origin, no CORS issues)
2. Forwards them to the Partner API 
3. Returns the response with proper CORS headers

## Architecture

```
Browser (localhost:3002)
  ↓ fetch('/api/partner-proxy/country/')
Next.js API Route (/api/partner-proxy/[...path])
  ↓ fetch('https://opmthredds.gem.spc.int/partner_api/v1/country/')
Partner API
  ↓ JSON response
Next.js API Route (adds CORS headers)
  ↓ JSON with CORS
Browser ✅
```

## Implementation Files

- **`src/app/api/partner-proxy/[...path]/route.ts`** - Proxy API route handler
- **`src/services/partnerApiService.ts`** - Updated to use proxy (`DEFAULT_PARTNER_API_BASE = ''`)

## Usage

The proxy is transparent to application code. The `partnerApiService` now constructs URLs like:

```typescript
// Old (direct, blocked by CORS):
'https://opmthredds.gem.spc.int/partner_api/v1/country/'

// New (via proxy, works):
'/api/partner-proxy/country/'
```

## Benefits

- ✅ **Bypasses CORS restrictions** - Browser sees same-origin requests
- ✅ **Server-side requests** - No browser security limitations
- ✅ **Caching control** - Can add cache headers for performance
- ✅ **Error handling** - Graceful fallback to local files
- ✅ **Production-ready** - Works in both dev and deployed environments

## Testing

```bash
# Test the proxy directly
curl http://localhost:3002/api/partner-proxy/country/

# Run health check (uses direct API, no proxy needed)
npm run check:partner-api
```

## Notes

- The health check script (`scripts/check-partner-api.js`) still uses the direct API because it runs server-side in Node.js where CORS doesn't apply
- The proxy adds a 30-second timeout per request
- Response caching is set to 5 minutes (`s-maxage=300`)
