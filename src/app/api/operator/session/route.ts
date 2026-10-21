import { NextRequest } from 'next/server';
import { relayOperatorRequest } from '@/lib/operatorAuth';

/** The signed-in operator (401 when signed out or the token was revoked). */
export async function GET(request: NextRequest) {
  return relayOperatorRequest(request, 'v1/operator/me/');
}
