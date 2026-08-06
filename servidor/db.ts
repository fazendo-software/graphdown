import { Pool } from "pg";

export function criarPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");
  return new Pool({ connectionString });
}
