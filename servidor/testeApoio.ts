// Apoio compartilhado pelos testes de servidor/*.test.ts — não é teste em si (sem *.test.ts
// no nome), então o glob do `npm test` não tenta rodá-lo sozinho.
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "./db.ts";
import { migrar } from "../migracoes/runner.ts";
import { semear } from "../migracoes/seed.ts";
import { criarPool } from "./db.ts";
import { criarServidor } from "./rotas.ts";
import { SalaProjetos } from "./ws.ts";

process.env.GRAPYDOWN_DATABASE ??= join(tmpdir(), `grapydown-test-${process.pid}.sqlite`);
process.env.COOKIE_SECRET ??= "segredo-de-teste-nao-usar-em-producao";

export type ServidorDeTeste = {
  base: string;
  pool: Pool;
  sala: SalaProjetos;
  fechar: () => Promise<void>;
};

export async function subirServidor(): Promise<ServidorDeTeste> {
  const pool = criarPool();
  await migrar(pool);
  await semear(pool);

  const sala = new SalaProjetos(pool);
  const servidor = criarServidor(pool, sala);
  sala.anexar(servidor);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  const porta = (servidor.address() as { port: number }).port;
  const base = `http://127.0.0.1:${porta}`;
  return {
    base,
    pool,
    sala,
    fechar: async () => {
      await new Promise<void>((ok) => servidor.close(() => ok()));
      await pool.end();
    },
  };
}

export type ClienteTeste = {
  get: (caminho: string) => Promise<Response>;
  post: (caminho: string, corpo?: unknown) => Promise<Response>;
  patch: (caminho: string, corpo?: unknown) => Promise<Response>;
  put: (caminho: string, corpo?: unknown) => Promise<Response>;
  delete: (caminho: string) => Promise<Response>;
  cookie: () => string;
};

/** `fetch` com cookie jar de uma sessão só — suficiente pra simular um navegador nos testes. */
export function clienteCookies(base: string): ClienteTeste {
  let cookie = "";
  async function pedir(caminho: string, init: RequestInit = {}): Promise<Response> {
    const cabecalhos = new Headers(init.headers);
    if (cookie) cabecalhos.set("cookie", cookie);
    cabecalhos.set("origin", base);
    const r = await fetch(`${base}${caminho}`, { ...init, headers: cabecalhos });
    const novoCookie = r.headers.get("set-cookie");
    if (novoCookie) cookie = novoCookie.split(";")[0];
    return r;
  }
  const comCorpo = (metodo: string) => (caminho: string, corpo?: unknown) =>
    pedir(caminho, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  return {
    get: (c) => pedir(c),
    post: comCorpo("POST"),
    patch: comCorpo("PATCH"),
    put: comCorpo("PUT"),
    delete: (c) => pedir(c, { method: "DELETE" }),
    cookie: () => cookie,
  };
}

export async function registrar(
  base: string,
  prefixo = "teste",
): Promise<{ cliente: ClienteTeste; usuarioId: string; email: string }> {
  const cliente = clienteCookies(base);
  const email = `${prefixo}-${randomUUID()}@exemplo.com`;
  const r = await cliente.post("/api/auth/registrar", { email, nome: "Fulano de Teste", senha: "senha1234" });
  const { usuario } = (await r.json()) as { usuario: { id: string } };
  return { cliente, usuarioId: usuario.id, email };
}

/** A principal é escolhida pelo nome, não pela ordem: `/api/categorias` ordena
 * alfabeticamente, então `[0]` seria "Atores" e os testes de nó dependem de "Processo". */
export async function criarProjetoDeTeste(cliente: ClienteTeste, principal = "Processo"): Promise<string> {
  const categorias = (await (await cliente.get("/api/categorias")).json()) as { id: string; nome: string }[];
  const categoria = categorias.find((c) => c.nome === principal) ?? categorias[0];
  const r = await cliente.post("/api/projetos", { nome: "Projeto de teste", categoria_id: categoria.id });
  const { id } = (await r.json()) as { id: string };
  return id;
}
