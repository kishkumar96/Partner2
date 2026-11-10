/**
 * PostgreSQL Database Client for PostGIS
 * Provides connection pooling and query utilities
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { getDatabaseUrl } from '@/lib/databaseUrl';

// Created on first use, not at import: building the app must not need a database, and a missing
// DATABASE_URL should surface as an error to handle where the query is made.
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    // Handle pool errors
    pool.on('error', err => {
      console.error('Unexpected database pool error:', err);
    });
  }
  return pool;
}

/**
 * Execute a query with automatic connection management
 */
export async function query<T extends QueryResultRow>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await getPool().query<T>(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms):`, text.substring(0, 100));
    }

    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  return await getPool().connect();
}

/**
 * Execute queries within a transaction
 */
export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Build a bounding box query for spatial filtering
 */
export function buildBBoxQuery(
  tableName: string,
  geomColumn: string,
  bbox: [number, number, number, number],
  additionalWhere?: string
): string {
  let query = `
    SELECT *, ST_AsGeoJSON(${geomColumn})::json as geometry
    FROM ${tableName}
    WHERE ST_Intersects(
      ${geomColumn},
      ST_MakeEnvelope($1, $2, $3, $4, 4326)
    )
  `;

  if (additionalWhere) {
    query += ` AND ${additionalWhere}`;
  }

  return query;
}

/**
 * Query features within a bounding box
 */
export async function queryBBox<T extends QueryResultRow>(
  tableName: string,
  bbox: [number, number, number, number],
  options: {
    geomColumn?: string;
    where?: string;
    limit?: number;
    offset?: number;
    orderBy?: string;
  } = {}
): Promise<QueryResult<T>> {
  const { geomColumn = 'geom', where, limit = 1000, offset = 0, orderBy } = options;

  const [minLng, minLat, maxLng, maxLat] = bbox;

  let query = buildBBoxQuery(tableName, geomColumn, bbox, where);

  if (orderBy) {
    query += ` ORDER BY ${orderBy}`;
  }

  query += ` LIMIT $5 OFFSET $6`;

  return await getPool().query<T>(query, [minLng, minLat, maxLng, maxLat, limit, offset]);
}

/**
 * Query features within a radius of a point
 */
export async function queryRadius<T extends QueryResultRow>(
  tableName: string,
  lng: number,
  lat: number,
  radiusMeters: number,
  options: {
    geomColumn?: string;
    where?: string;
    limit?: number;
  } = {}
): Promise<QueryResult<T>> {
  const { geomColumn = 'geom', where, limit = 100 } = options;

  let query = `
    SELECT *, 
           ST_AsGeoJSON(${geomColumn})::json as geometry,
           ST_Distance(
             ${geomColumn}::geography,
             ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
           ) as distance
    FROM ${tableName}
    WHERE ST_DWithin(
      ${geomColumn}::geography,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      $3
    )
  `;

  if (where) {
    query += ` AND ${where}`;
  }

  query += ` ORDER BY distance LIMIT $4`;

  return await getPool().query<T>(query, [lng, lat, radiusMeters, limit]);
}

/**
 * Get aggregated statistics
 */
export async function queryStats(
  tableName: string,
  groupBy?: string,
  where?: string
): Promise<any[]> {
  let query = `
    SELECT 
      ${groupBy ? `${groupBy},` : ''}
      COUNT(*) as count,
      SUM(total_loss) as total_loss,
      AVG(total_loss) as avg_loss,
      MIN(total_loss) as min_loss,
      MAX(total_loss) as max_loss
    FROM ${tableName}
  `;

  if (where) {
    query += ` WHERE ${where}`;
  }

  if (groupBy) {
    query += ` GROUP BY ${groupBy}`;
  }

  const result = await getPool().query(query);
  return result.rows;
}

/**
 * Check database health
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await getPool().query('SELECT NOW()');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Close pool connections gracefully
 */
export async function closePool(): Promise<void> {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
}

// The pool, created on first use, for advanced usage
export { getPool };

// Default export
const db = {
  query,
  getClient,
  transaction,
  queryBBox,
  queryRadius,
  queryStats,
  buildBBoxQuery,
  healthCheck,
  closePool,
  pool,
};

export default db;
