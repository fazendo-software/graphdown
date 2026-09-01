import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type Resultado<T> = { rows: T[]; rowCount: number };
type Valor = unknown;

function valor(v: Valor): string | number | null {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString().replace("T", " ").replace("Z", "");
  if (typeof v === "boolean") return Number(v);
  if (typeof v === "number" || typeof v === "string") return v;
  return JSON.stringify(v);
}

function sql(texto: string): string {
  return texto
    .replace(/\bnow\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\s+for update\b/gi, "")
    .replace(/begin transaction isolation level repeatable read read only/gi, "begin")
    .replace(/\bilike\b/gi, "like")
    .replace(/::text\b/gi, "");
}

function linha<T>(dados: Record<string, unknown>): T {
  for (const chave of ["campos", "definicao", "pontos"]) {
    if (typeof dados[chave] === "string") {
      try { dados[chave] = JSON.parse(dados[chave] as string); } catch { /* texto comum */ }
    }
  }
  for (const chave of ["eh_tarefa", "semeada"]) {
    if (typeof dados[chave] === "number") dados[chave] = Boolean(dados[chave]);
  }
  return dados as T;
}

/** Adaptador mínimo sobre SQLite: o servidor continua com a API de queries já testada. */
export class Pool {
  private db: DatabaseSync;

  constructor(caminho: string) {
    mkdirSync(dirname(caminho), { recursive: true });
    this.db = new DatabaseSync(caminho, { timeout: 5_000 });
    this.db.exec("pragma foreign_keys = on; pragma journal_mode = wal; pragma busy_timeout = 5000;");
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(texto: string, params: Valor[] = []): Promise<Resultado<T>> {
    if (/pg_advisory_(lock|unlock)/i.test(texto)) return { rows: [], rowCount: 0 };
    const comando = sql(texto).trim();
    if (params.length === 0 && comando.includes(";")) {
      this.db.exec(comando);
      return { rows: [], rowCount: 0 };
    }
    const valores = Object.fromEntries(params.map((v, i) => [String(i + 1), valor(v)]));
    const stmt = this.db.prepare(comando);
    if (/^(select|with|pragma|explain)\b/i.test(comando) || /\breturning\b/i.test(comando)) {
      const rows = stmt.all(valores).map((d) => linha<T>(d as Record<string, unknown>));
      return { rows, rowCount: rows.length };
    }
    const resultado = stmt.run(valores);
    return { rows: [], rowCount: Number(resultado.changes) };
  }

  async connect(): Promise<PoolClient> { return new PoolClient(this); }
  async end(): Promise<void> { this.db.close(); }
}

export class PoolClient {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }
  query<T extends Record<string, unknown> = Record<string, unknown>>(texto: string, params?: Valor[]) { return this.pool.query<T>(texto, params); }
  release(): void {}
}

export function criarPool(): Pool {
  return new Pool(resolve(process.env.GRAPYDOWN_DATABASE ?? "grapydown.sqlite"));
}
