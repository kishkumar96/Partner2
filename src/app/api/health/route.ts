/**
 * API Route: Health Check
 * Tests database connectivity
 *
 * Example:
 *   /api/health
 */

import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { getConfigRelease } from '@/config/registry';
import { DatabaseNotConfiguredError, getDatabaseUrl } from '@/lib/databaseUrl';

export async function GET() {
  const checks: any = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    status: 'unknown',
    // Which configuration this deployment was built from; reported even when a service is down
    config: getConfigRelease(),
    services: {
      database: 'unknown',
    },
  };

  let client: Client | null = null;

  try {
    // Check database
    client = new Client({ connectionString: getDatabaseUrl() });
    await client.connect();
    const result = await client.query('SELECT COUNT(*) as count FROM damaged_buildings');

    checks.services.database = 'healthy';
    checks.database_stats = {
      buildings_count: parseInt(result.rows[0].count),
    };
    checks.status = 'healthy';

    return NextResponse.json(checks, { status: 200 });
  } catch (error) {
    checks.status = 'unhealthy';
    checks.services.database =
      error instanceof DatabaseNotConfiguredError ? 'not configured' : 'unhealthy';
    checks.error = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(checks, { status: 503 });
  } finally {
    if (client) {
      await client.end();
    }
  }
}
