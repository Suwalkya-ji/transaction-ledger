import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

// Helper to determine if we should disable SSL (e.g., local development on localhost)
const isLocalhost = Boolean(
  (config.database.url && (config.database.url.includes('localhost') || config.database.url.includes('127.0.0.1'))) ||
  (config.database.host && (config.database.host === 'localhost' || config.database.host === '127.0.0.1'))
);

const poolConfig = config.database.url
  ? {
      connectionString: config.database.url,
      ssl: isLocalhost ? false : config.database.ssl,
    }
  : {
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      ssl: isLocalhost ? false : config.database.ssl,
    };

export const pool = new Pool(poolConfig);

// Catch errors on idle clients in the pool to prevent uncaught exceptions crashing the process
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

/**
 * Execute a parameterized query using the connection pool.
 * @param {string} text - SQL query string
 * @param {Array} [params] - Optional array of bind parameters
 * @returns {Promise<pg.QueryResult>}
 */
export const query = (text, params) => pool.query(text, params);

/**
 * Test database connectivity by acquiring a client, running a sanity query, and releasing it.
 * @returns {Promise<{success: boolean, details?: object, error?: string}>}
 */
export const testConnection = async () => {
  let client;
  try {
    if (!config.database.url && !config.database.host) {
      const msg = 'No DATABASE_URL or DB_HOST configured in environment variables.';
      console.warn(`⚠️  ${msg}`);
      return { success: false, error: msg };
    }

    client = await pool.connect();
    const result = await client.query('SELECT NOW() AS current_time, current_database() AS db_name, version() AS version;');
    const row = result.rows[0];
    
    console.log('✅ PostgreSQL database connected successfully.');
    console.log(`   Database: ${row.db_name}`);
    console.log(`   Server Time: ${row.current_time}`);
    return {
      success: true,
      details: {
        database: row.db_name,
        time: row.current_time,
        version: row.version,
      },
    };
  } catch (err) {
    console.error('❌ Failed to connect to PostgreSQL database:', err.message);
    return { success: false, error: err.message };
  } finally {
    if (client) client.release();
  }
};

export default {
  pool,
  query,
  testConnection,
};
