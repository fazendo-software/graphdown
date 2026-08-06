#!/usr/bin/env -S node --experimental-strip-types
import { migrar } from "../migracoes/runner.ts";
import { semear } from "../migracoes/seed.ts";
import { criarPool } from "./db.ts";
import { criarServidor } from "./rotas.ts";
import { SalaProjetos } from "./ws.ts";

const [comando] = process.argv.slice(2);

if (comando !== "serve") {
  console.error("uso: grapydown serve");
  process.exit(1);
}

for (const nome of ["DATABASE_URL", "COOKIE_SECRET"]) {
  if (!process.env[nome]) {
    console.error(`variável de ambiente ausente: ${nome}`);
    process.exit(1);
  }
}

const porta = Number(process.env.PORTA ?? 5174);
const pool = criarPool();

await migrar(pool);
await semear(pool);

const sala = new SalaProjetos(pool);
const servidor = criarServidor(pool, sala);
sala.anexar(servidor);

servidor.listen(porta, () => {
  console.log(`grapydown  http://localhost:${porta}`);
});
