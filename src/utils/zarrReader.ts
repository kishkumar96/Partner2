import { decompress } from 'fzstd';

/**
 * A small reader for the hazard catalogue's Zarr store, over HTTP.
 *
 * The store is plain Zarr v2: `.zmetadata` (all the metadata in one file), then one file per chunk,
 * zstd-compressed, little-endian, C order, no filters. That is all this reads, and it says so when
 * it meets anything else. A full Zarr library is not needed to pull one 2-D slice out of it.
 */

export class ZarrError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZarrError';
  }
}

export interface ZarrArrayMeta {
  shape: number[];
  chunks: number[];
  dtype: string;
  fill_value: number | string | null;
  order: string;
  filters: unknown[] | null;
  compressor: { id: string } | null;
  dimension_separator?: string;
  zarr_format: number;
}

type NumericArray =
  | Float32Array
  | Float64Array
  | Int32Array
  | BigInt64Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int16Array;

const NUMERIC_DTYPES: Record<
  string,
  { itemSize: number; create: (buffer: ArrayBuffer, length: number) => NumericArray }
> = {
  '<f4': { itemSize: 4, create: (b, n) => new Float32Array(b, 0, n) },
  '<f8': { itemSize: 8, create: (b, n) => new Float64Array(b, 0, n) },
  '<i4': { itemSize: 4, create: (b, n) => new Int32Array(b, 0, n) },
  '<i8': { itemSize: 8, create: (b, n) => new BigInt64Array(b, 0, n) },
  '<i2': { itemSize: 2, create: (b, n) => new Int16Array(b, 0, n) },
  '<u2': { itemSize: 2, create: (b, n) => new Uint16Array(b, 0, n) },
  '<u4': { itemSize: 4, create: (b, n) => new Uint32Array(b, 0, n) },
  '|u1': { itemSize: 1, create: (b, n) => new Uint8Array(b, 0, n) },
};

const STRING_DTYPE = /^<U(\d+)$/;

const product = (values: number[]) => values.reduce((total, value) => total * value, 1);

function itemSizeOf(dtype: string): number {
  const numeric = NUMERIC_DTYPES[dtype];
  if (numeric) return numeric.itemSize;
  const string = STRING_DTYPE.exec(dtype);
  if (string) return Number(string[1]) * 4;
  throw new ZarrError(`unsupported data type '${dtype}'`);
}

function fillOf(meta: ZarrArrayMeta): number {
  if (meta.fill_value === 'NaN') return Number.NaN;
  if (meta.fill_value === 'Infinity') return Number.POSITIVE_INFINITY;
  if (meta.fill_value === '-Infinity') return Number.NEGATIVE_INFINITY;
  return typeof meta.fill_value === 'number' ? meta.fill_value : 0;
}

/** A fixed-width UTF-32 string ('<U32') out of its bytes: code points up to the first zero. */
function decodeUtf32(bytes: Uint8Array, width: number): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let text = '';
  for (let i = 0; i < width; i += 1) {
    const codePoint = view.getUint32(i * 4, true);
    if (codePoint === 0) break;
    text += String.fromCodePoint(codePoint);
  }
  return text;
}

export class ZarrHttpStore {
  private consolidated: Promise<Record<string, unknown>> | null = null;

  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly signal?: AbortSignal
  ) {}

  private url(key: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${key}`;
  }

  /** Every `.zarray` / `.zattrs` of the store, from the one consolidated metadata file. */
  private metadata(): Promise<Record<string, unknown>> {
    if (!this.consolidated) {
      this.consolidated = (async () => {
        const response = await this.fetchImpl(this.url('.zmetadata'), { signal: this.signal });
        if (!response.ok)
          throw new ZarrError(`could not read the store's metadata (HTTP ${response.status})`);
        const parsed = (await response.json()) as { metadata?: Record<string, unknown> };
        if (!parsed.metadata) throw new ZarrError('the store has no consolidated metadata');
        return parsed.metadata;
      })();
      // a failed read must not be remembered, or the layer could never recover
      this.consolidated.catch(() => {
        this.consolidated = null;
      });
    }
    return this.consolidated;
  }

  async arrayMeta(path: string): Promise<ZarrArrayMeta> {
    const meta = (await this.metadata())[`${path}/.zarray`] as ZarrArrayMeta | undefined;
    if (!meta) throw new ZarrError(`the store has no array '${path}'`);
    if (meta.zarr_format !== 2)
      throw new ZarrError(`'${path}' is Zarr v${meta.zarr_format}; only v2 is read`);
    if (meta.order !== 'C')
      throw new ZarrError(`'${path}' is stored in ${meta.order} order; only C is read`);
    if (meta.filters && meta.filters.length > 0)
      throw new ZarrError(`'${path}' uses filters, which are not read`);
    if (meta.compressor && meta.compressor.id !== 'zstd') {
      throw new ZarrError(`'${path}' is compressed with ${meta.compressor.id}; only zstd is read`);
    }
    itemSizeOf(meta.dtype);
    return meta;
  }

  async attrs(path: string): Promise<Record<string, unknown>> {
    const key = path ? `${path}/.zattrs` : '.zattrs';
    return ((await this.metadata())[key] as Record<string, unknown> | undefined) ?? {};
  }

  /** One chunk file, or null when it was never written (the array's fill value applies). */
  private async chunkBytes(
    path: string,
    index: number[],
    meta: ZarrArrayMeta
  ): Promise<Uint8Array | null> {
    const separator = meta.dimension_separator ?? '.';
    const response = await this.fetchImpl(this.url(`${path}/${index.join(separator)}`), {
      signal: this.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok)
      throw new ZarrError(
        `could not read '${path}' chunk ${index.join(separator)} (HTTP ${response.status})`
      );
    const raw = new Uint8Array(await response.arrayBuffer());
    const bytes = meta.compressor ? decompress(raw) : raw;
    const expected = product(meta.chunks) * itemSizeOf(meta.dtype);
    if (bytes.length !== expected) {
      throw new ZarrError(
        `'${path}' chunk ${index.join(separator)} holds ${bytes.length} bytes, expected ${expected}`
      );
    }
    // a typed array needs aligned bytes
    return bytes.byteOffset % 8 === 0 ? bytes : bytes.slice();
  }

  /** A whole 1-D array (a coordinate): numbers, or strings for '<U' arrays. */
  async vector(path: string): Promise<Array<number | string>> {
    const meta = await this.arrayMeta(path);
    if (meta.shape.length !== 1) throw new ZarrError(`'${path}' is not one-dimensional`);
    const [length] = meta.shape;
    const [chunkLength] = meta.chunks;
    const string = STRING_DTYPE.exec(meta.dtype);
    const itemSize = itemSizeOf(meta.dtype);
    const out: Array<number | string> = new Array(length);
    const chunkCount = Math.ceil(length / chunkLength);
    await Promise.all(
      Array.from({ length: chunkCount }, async (_, chunk) => {
        const bytes = await this.chunkBytes(path, [chunk], meta);
        for (let i = 0; i < chunkLength && chunk * chunkLength + i < length; i += 1) {
          const position = chunk * chunkLength + i;
          if (!bytes) {
            out[position] = string ? '' : fillOf(meta);
          } else if (string) {
            out[position] = decodeUtf32(
              bytes.subarray(i * itemSize, (i + 1) * itemSize),
              Number(string[1])
            );
          } else {
            const typed = NUMERIC_DTYPES[meta.dtype].create(
              bytes.buffer as ArrayBuffer,
              chunkLength
            );
            const value = typed[i];
            out[position] = typeof value === 'bigint' ? Number(value) : value;
          }
        }
      })
    );
    return out;
  }

  /**
   * One 2-D plane of an array shaped [...leading, y, x]: `leading` fixes the leading indices.
   * Chunks that were never written read as the fill value (NaN for the depth arrays).
   */
  async plane(
    path: string,
    leading: number[]
  ): Promise<{ data: Float32Array; height: number; width: number }> {
    const meta = await this.arrayMeta(path);
    const rank = meta.shape.length;
    if (rank < 2 || leading.length !== rank - 2) {
      throw new ZarrError(`'${path}' needs ${rank - 2} leading indices, got ${leading.length}`);
    }
    leading.forEach((index, axis) => {
      if (!Number.isInteger(index) || index < 0 || index >= meta.shape[axis]) {
        throw new ZarrError(
          `index ${index} is outside axis ${axis} of '${path}' (size ${meta.shape[axis]})`
        );
      }
    });
    const dtype = NUMERIC_DTYPES[meta.dtype];
    if (!dtype) throw new ZarrError(`'${path}' is not numeric`);

    const height = meta.shape[rank - 2];
    const width = meta.shape[rank - 1];
    const [chunkY, chunkX] = [meta.chunks[rank - 2], meta.chunks[rank - 1]];
    const leadingChunk = leading.map((index, axis) => Math.floor(index / meta.chunks[axis]));
    // where this plane starts inside a chunk (C order): the leading offsets times the sizes after them
    let planeOffset = 0;
    leading.forEach((index, axis) => {
      planeOffset += (index % meta.chunks[axis]) * product(meta.chunks.slice(axis + 1));
    });

    const data = new Float32Array(height * width).fill(fillOf(meta));
    await Promise.all(
      Array.from({ length: Math.ceil(height / chunkY) }, (_, chunkRow) =>
        Promise.all(
          Array.from({ length: Math.ceil(width / chunkX) }, async (__, chunkCol) => {
            const bytes = await this.chunkBytes(path, [...leadingChunk, chunkRow, chunkCol], meta);
            if (!bytes) return;
            const typed = dtype.create(bytes.buffer as ArrayBuffer, product(meta.chunks));
            const rows = Math.min(chunkY, height - chunkRow * chunkY);
            const cols = Math.min(chunkX, width - chunkCol * chunkX);
            for (let r = 0; r < rows; r += 1) {
              const from = planeOffset + r * chunkX;
              const to = (chunkRow * chunkY + r) * width + chunkCol * chunkX;
              for (let c = 0; c < cols; c += 1) {
                const value = typed[from + c];
                data[to + c] = typeof value === 'bigint' ? Number(value) : value;
              }
            }
          })
        )
      )
    );
    return { data, height, width };
  }
}
