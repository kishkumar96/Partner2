/**
 * Metrics API Route
 * Provides application metrics for monitoring
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Metrics {
  timestamp: string;
  application: {
    name: string;
    version: string;
    environment: string;
    uptime: number;
  };
  process: {
    pid: number;
    memory: ReturnType<typeof process.memoryUsage>;
    cpu: NodeJS.CpuUsage;
  };
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
  };
}

export async function GET(request: NextRequest) {
  // Check for authorization
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.METRICS_AUTH_TOKEN;

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const metrics: Metrics = {
    timestamp: new Date().toISOString(),
    application: {
      name: process.env.NEXT_PUBLIC_APP_NAME || 'Tropical Cyclone Rapid Impact Assessment Tool',
      version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      environment: process.env.NEXT_PUBLIC_ENVIRONMENT || 'development',
      uptime: process.uptime(),
    },
    process: {
      pid: process.pid,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
  };

  return NextResponse.json(metrics, {
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json',
    },
  });
}
