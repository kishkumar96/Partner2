import { NextRequest } from 'next/server';
import { jsonError, relayOperatorRequest } from '@/lib/operatorAuth';

export async function GET(request: NextRequest) {
  const track = request.nextUrl.searchParams.get('track') ?? '';
  if (!/^\d+$/.test(track)) return jsonError('Pass ?track=<id>.', 400);
  return relayOperatorRequest(request, `v1/operator/runs/?track=${track}`);
}
