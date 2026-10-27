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

export default {
  pool,
  query,
};
