import { readdir, readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

// Cada archivo pendiente y su registro se confirman en la misma transacción.
export async function runMigrations(pool: Pool, log: (message: string) => void = () => {}) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(20261022)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = new URL('../../migrations/', import.meta.url);
    const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of files) {
      const existing = await client.query('SELECT name FROM schema_migrations WHERE name = $1', [
        name,
      ]);
      if (existing.rowCount) {
        log(`Ya aplicada: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(await readFile(new URL(name, directory), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        log(`Aplicada: ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    // Cerrar esta conexión también libera el advisory lock, incluso ante fallos.
    client.release(true);
  }
}
