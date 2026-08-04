import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { construirGrafo } from "../core/grafo.ts";
import { parseNota, editarCampo, editarCorpo } from "../core/parse.ts";
import { parseCategoria, templateNo, idDeTitulo } from "../core/categoria.ts";
import type { Layout } from "../core/tipos.ts";
import {
  caminhoNo,
  escrever,
  gravarLayout,
  idValido,
  lerLayout,
  lerPasta,
  paraLixeira,
} from "./arquivos.ts";
import { assinarEventos } from "./watcher.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(RAIZ, "web", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(texto);
}

async function corpoJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const pedacos: Buffer[] = [];
  for await (const p of req) pedacos.push(p as Buffer);
  if (pedacos.length === 0) return {};
  return JSON.parse(Buffer.concat(pedacos).toString("utf8")) as Record<string, unknown>;
}

async function lerMeta(dir: string): Promise<{ titulo: string; categoria: string }> {
  try {
    const cru = (parseYaml(await readFile(join(dir, "_grafo.yaml"), "utf8")) ?? {}) as {
      titulo?: string;
      categoria?: string;
    };
    return { titulo: cru.titulo ?? "Sem título", categoria: cru.categoria ?? "processo" };
  } catch {
    return { titulo: "Sem título", categoria: "processo" };
  }
}

async function lerCategoria(nome: string) {
  try {
    return parseCategoria(await readFile(join(RAIZ, "categorias", `${nome}.yaml`), "utf8"));
  } catch {
    return parseCategoria("");
  }
}

async function servirEstatico(res: ServerResponse, caminhoBruto: string): Promise<void> {
  let alvo: string;
  try {
    alvo = decodeURIComponent(caminhoBruto === "/" ? "/index.html" : caminhoBruto);
  } catch {
    res.writeHead(400).end("caminho inválido");
    return;
  }
  const candidato = resolve(WEB, `.${alvo}`);
  // ponytail: mesma guarda que idValido dá aos nós, aqui pra o bundle estático — nunca
  // deixa o caminho escapar de web/dist.
  if (candidato !== WEB && !candidato.startsWith(WEB + sep)) {
    res.writeHead(400).end("caminho inválido");
    return;
  }
  try {
    const dados = await readFile(candidato);
    res.writeHead(200, { "content-type": MIME[extname(alvo)] ?? "application/octet-stream" });
    res.end(dados);
  } catch {
    try {
      res.writeHead(200, { "content-type": MIME[".html"] });
      res.end(await readFile(join(WEB, "index.html")));
    } catch {
      res.writeHead(404).end("não encontrado — rode `npm run build:web`");
    }
  }
}

export function criarServidor(dir: string): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    // Cru, não decodificado: decodificar aqui faria %2F virar / e o traversal escaparia
    // do regex de rota abaixo (que trata / como separador de segmento). Cada rota decodifica
    // só o pedaço que precisa, depois de já ter sido isolado pelo regex.
    const rota = url.pathname;
    const metodo = req.method ?? "GET";

    try {
      if (!rota.startsWith("/api/")) return await servirEstatico(res, rota);

      if (rota === "/api/eventos") return assinarEventos(res);

      if (rota === "/api/grafo" && metodo === "GET") {
        const meta = await lerMeta(dir);
        const grafo = construirGrafo(await lerPasta(dir));
        return json(res, 200, {
          titulo: meta.titulo,
          categoria: await lerCategoria(meta.categoria),
          nos: grafo.nos,
          arestas: grafo.arestas,
          fantasmas: grafo.fantasmas,
          layout: await lerLayout(dir),
        });
      }

      if (rota === "/api/layout" && metodo === "PUT") {
        const corpo = await corpoJson(req);
        await gravarLayout(dir, corpo as unknown as Layout);
        return json(res, 200, { ok: true });
      }

      if (rota === "/api/no" && metodo === "POST") {
        const { titulo } = (await corpoJson(req)) as { titulo?: string };
        if (!titulo) return json(res, 400, { erro: "titulo obrigatório" });
        const meta = await lerMeta(dir);
        const categoria = await lerCategoria(meta.categoria);
        const existentes = new Set((await lerPasta(dir)).map((a) => a.id));
        const base = idDeTitulo(titulo);
        let id = base;
        for (let n = 2; existentes.has(id); n++) id = `${base}-${n}`;
        await escrever(caminhoNo(dir, id), templateNo(categoria, titulo));
        return json(res, 201, { id });
      }

      const mNo = rota.match(/^\/api\/no\/([^/]+)(\/corpo)?$/);
      if (mNo) {
        let id: string;
        try {
          id = decodeURIComponent(mNo[1]);
        } catch {
          return json(res, 400, { erro: "id inválido" });
        }
        const ehCorpo = Boolean(mNo[2]);
        if (!idValido(id)) return json(res, 400, { erro: "id inválido" });

        if (metodo === "GET" && !ehCorpo) {
          const texto = await readFile(caminhoNo(dir, id), "utf8");
          const { doc, corpo, erro } = parseNota(texto);
          return json(res, 200, {
            id,
            campos: erro ? {} : (doc.toJS() ?? {}),
            corpo,
            erro,
          });
        }

        if (metodo === "PATCH" && !ehCorpo) {
          const { campos } = (await corpoJson(req)) as { campos?: Record<string, unknown> };
          if (!campos) return json(res, 400, { erro: "campos obrigatório" });
          let texto = await readFile(caminhoNo(dir, id), "utf8");
          for (const [chave, valor] of Object.entries(campos)) {
            texto = editarCampo(texto, chave, valor);
          }
          await escrever(caminhoNo(dir, id), texto);
          return json(res, 200, { ok: true });
        }

        if (metodo === "PUT" && ehCorpo) {
          const { corpo } = (await corpoJson(req)) as { corpo?: string };
          if (typeof corpo !== "string") return json(res, 400, { erro: "corpo obrigatório" });
          const texto = await readFile(caminhoNo(dir, id), "utf8");
          await escrever(caminhoNo(dir, id), editarCorpo(texto, corpo));
          return json(res, 200, { ok: true });
        }

        if (metodo === "DELETE" && !ehCorpo) {
          await paraLixeira(dir, id);
          return json(res, 200, { ok: true });
        }
      }

      return json(res, 404, { erro: "rota não encontrada" });
    } catch (e) {
      return json(res, 500, { erro: (e as Error).message });
    }
  });
}
