import { testConnection, pool } from '../config/db.js';

console.log('Testing PostgreSQL database connection...\n');

const run = async () => {
  const result = await testConnection();
  await pool.end();
  
  if (result.success) {
    console.log('\nDatabase connection test passed!');
    process.exit(0);
  } else {
    console.error('\nDatabase connection test failed.');
    process.exit(1);
  }
};

run();
