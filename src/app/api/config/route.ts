/**
 * API Route: Configuration release
 * Read-only: which configuration (config/) this deployment was built from.
 * No database, no secrets, so a deploy can be checked even when other services are down.
 *
 * Example:
 *   /api/config  ->  { configVersion, schemaVersion, contentSha256, countries }
 */

import { NextResponse } from 'next/server';
import { getConfigDiagnostic } from '@/config/registry';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(getConfigDiagnostic(), { headers: { 'Cache-Control': 'no-store' } });
}
