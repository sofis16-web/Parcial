import { pool } from '../src/shared/database.js';
import { runMigrations } from '../src/shared/migrations.js';

try {
  await runMigrations(pool, console.log);
} catch (error) {
  console.error('Migración fallida:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
