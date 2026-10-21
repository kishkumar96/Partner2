import { NextRequest } from 'next/server';
import { relayOperatorRequest } from '@/lib/operatorAuth';

export async function GET(request: NextRequest) {
  return relayOperatorRequest(request, 'v1/operator/pipelines/');
}
