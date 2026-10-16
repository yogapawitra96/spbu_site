import "server-only";
import mysql, { type Pool } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var spbuPool: Pool | undefined;
}

function createPool(): Pool {
  const host = process.env.SPBU_DB_HOST;
  const database = process.env.SPBU_DB_NAME;
  const user = process.env.SPBU_DB_USER;
  const password = process.env.SPBU_DB_PASSWORD;
  if (!host || !database || !user || !password) {
    throw new Error("Environment SPBU_DB_HOST/NAME/USER/PASSWORD belum lengkap");
  }
  return mysql.createPool({
    host, port: Number(process.env.SPBU_DB_PORT || 3306), database, user, password,
    waitForConnections: true, connectionLimit: 5, queueLimit: 0,
    ...(process.env.SPBU_DB_SSL === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
  });
}
export const spbuDb = global.spbuPool ?? createPool();
if (process.env.NODE_ENV !== "production") global.spbuPool = spbuDb;
