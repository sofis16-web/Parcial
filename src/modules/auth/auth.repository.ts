import { pool } from '../../shared/database.js';

export interface PublicUser {
  id: number;
  username: string;
}

export async function upsertUser(username: string, passwordHash: string): Promise<PublicUser> {
  const result = await pool.query<PublicUser>(
    `INSERT INTO users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id, username`,
    [username, passwordHash],
  );
  return result.rows[0]!;
}

export async function findUserWithHash(
  username: string,
): Promise<(PublicUser & { passwordHash: string }) | null> {
  const result = await pool.query(
    'SELECT id, username, password_hash FROM users WHERE username = $1',
    [username],
  );
  const row = result.rows[0];
  return row ? { id: row.id, username: row.username, passwordHash: row.password_hash } : null;
}

export async function createSession(tokenHash: string, userId: number, expiresAt: Date) {
  await pool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [
    tokenHash,
    userId,
    expiresAt,
  ]);
}

export async function findUserBySession(tokenHash: string): Promise<PublicUser | null> {
  const result = await pool.query<PublicUser>(
    `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function deleteSession(tokenHash: string) {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function deleteExpiredSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
}
