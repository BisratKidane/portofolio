import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

// MariaDB's `SELECT VERSION()` reports a string containing "MariaDB"
// (e.g. `10.11.6-MariaDB`) while MySQL 8.4's does not.
export async function isMariaDB() {
  const conn = await mysql.createConnection({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.name
  });

  try {
    const [rows] = await conn.query('SELECT VERSION() AS version');
    return /mariadb/i.test(rows[0].version);
  } finally {
    await conn.end();
  }
}
