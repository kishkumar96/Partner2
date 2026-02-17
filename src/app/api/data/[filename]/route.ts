import { NextRequest, NextResponse } from 'next/server';
import { ReadableStream } from 'stream/web';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import zlib from 'zlib';

const gzip = promisify(zlib.gzip);

const CHUNK_SIZE = 64 * 1024; // 64KB chunks for streaming

/**
 * API Route for optimized data file serving
 * Features:
 * - Streaming for large files
 * - Automatic compression
 * - Range request support
 * - Efficient caching
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Security: Only allow specific file types
  if (!filename.endsWith('.geojson') && !filename.endsWith('.csv')) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), 'public', filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  // Check for range request (for resumable downloads)
  const range = request.headers.get('range');

  // For small files (< 1MB), send directly with compression
  if (fileSize < 1024 * 1024) {
    const content = fs.readFileSync(filePath);
    const compressed = await gzip(content);

    return new NextResponse(compressed, {
      headers: {
        'Content-Type': filename.endsWith('.geojson') ? 'application/geo+json' : 'text/csv',
        'Content-Encoding': 'gzip',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Content-Length': compressed.length.toString(),
      },
    });
  }

  // For large files, use streaming
  if (range) {
    // Handle range requests for resumable downloads
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;

    const stream = fs.createReadStream(filePath, { start, end });

    return new NextResponse(stream as any, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString(),
        'Content-Type': filename.endsWith('.geojson') ? 'application/geo+json' : 'text/csv',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  }

  // Stream full file in chunks
  const readStream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });

  return new NextResponse(readStream as any, {
    headers: {
      'Content-Type': filename.endsWith('.geojson') ? 'application/geo+json' : 'text/csv',
      'Content-Length': fileSize.toString(),
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Accept-Ranges': 'bytes',
    },
  });
}
