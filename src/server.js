import app from './app.js';
import { config } from './config/env.js';
import { pool } from './config/db.js';

const server = app.listen(config.port, () => {
  console.log(`🚀 Transaction Ledger API running in ${config.nodeEnv} mode`);
  console.log(`🔗 Local URL: http://localhost:${config.port}`);
  console.log(`🩺 Health check: http://localhost:${config.port}/api/health`);
});

// Handle graceful shutdown on process termination signals
const handleGracefulShutdown = (signal) => {
  console.log(`\nReceived ${signal}. Gracefully terminating server...`);
  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await pool.end();
      console.log('PostgreSQL connection pool drained.');
    } catch (err) {
      console.error('Error closing database pool:', err);
    }
    process.exit(0);
  });
};

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
