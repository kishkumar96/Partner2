import { NextRequest } from 'next/server';
import { jsonError, rejectCrossSite, relayOperatorRequest } from '@/lib/operatorAuth';

const MAX_TRACK_BYTES = 5 * 1024 * 1024;
const FIELDS = ['cyclone_name', 'issued_time', 'cyclone_track_type', 'country'] as const;

/** Submit a track file; the Partner API stores it and queues its model runs. */
export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;

  const form = await request.formData().catch(() => null);
  const file = form?.get('track_file');
  if (!form || !(file instanceof File)) return jsonError('Attach a track file.', 400);
  if (file.size > MAX_TRACK_BYTES) return jsonError('The track file is larger than 5 MB.', 400);

  // Forward only the expected fields
  const upstream = new FormData();
  for (const field of FIELDS) {
    const value = form.get(field);
    if (typeof value === 'string' && value) upstream.set(field, value);
  }
  upstream.set('track_file', file, file.name);
  return relayOperatorRequest(request, 'v1/operator/tracks/', { method: 'POST', body: upstream });
}
