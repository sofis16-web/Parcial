import { pool } from '../src/shared/database.js';
import { hashPassword } from '../src/modules/auth/auth.password.js';
import { upsertUser } from '../src/modules/auth/auth.repository.js';

// Usuario de prueba repetible: las credenciales vienen del entorno, no de Git.
try {
  const username = process.env.SEED_USERNAME?.trim().toLowerCase();
  const password = process.env.SEED_PASSWORD;
  if (!username || username.length > 64)
    throw new Error('SEED_USERNAME debe tener 1-64 caracteres.');
  if (!password || password.length < 8) throw new Error('SEED_PASSWORD debe tener 8+ caracteres.');
  const user = await upsertUser(username, await hashPassword(password));
  console.log(`Usuario listo: ${user.username}`);
} catch (error) {
  console.error('Seed fallido:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
