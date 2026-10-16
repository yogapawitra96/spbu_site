import "server-only";
import mysql, { type Pool } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var kpiPool: Pool | undefined;
}

function createPool(): Pool {
  const host = process.env.KPI_DB_HOST;
  const database = process.env.KPI_DB_NAME;
  const user = process.env.KPI_DB_USER;
  const password = process.env.KPI_DB_PASSWORD;
  if (!host || !database || !user || !password) {
    throw new Error("Environment KPI_DB_HOST/NAME/USER/PASSWORD belum lengkap");
  }
  return mysql.createPool({
    host, port: Number(process.env.KPI_DB_PORT || 3306), database, user, password,
    waitForConnections: true, connectionLimit: 5, queueLimit: 0,
    ...(process.env.KPI_DB_SSL === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
  });
}
export const kpiDb = global.kpiPool ?? createPool();
if (process.env.NODE_ENV !== "production") global.kpiPool = kpiDb;
