import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import type { EstadoExecucao, Papel, Posicao } from "../core/tipos.ts";
import { ESTADOS_EXECUCAO } from "../core/tipos.ts";
import { ehTipoObjetoSeta, pontosObjetoSetaValidos } from "../core/objetosSeta.ts";
import {
  apagarSessao,
  criarSessao,
  hashSenha,
  lerCookie,
  loginLimitado,
  resolverSessao,
  serializarCookieLimpo,
  serializarCookieSessao,
  verificarSenha,
} from "./auth.ts";
import { resolverMembership } from "./membros.ts";
import { listarCategorias, buscarCategoriaPorId, categoriaDoProjeto } from "./categorias.ts";
import { apagarProjeto, buscarProjeto, criarProjeto, listarProjetos } from "./projetos.ts";
import { montarGrafo } from "./grafo.ts";
import { montarExportacao } from "./exportacao.ts";
import { apagarNo, atualizarCorpo, atualizarNo, buscarNo, buscarNos, criarNo, type PatchNo } from "./nos.ts";
import { apagarAresta, atualizarAresta, criarAresta } from "./arestas.ts";
import { apagarNota, atualizarNota, criarNota, listarNotas, type PatchNota } from "./notas.ts";
import { apagarObjetoSeta, atualizarObjetoSeta, buscarObjetoSeta, criarObjetoSeta } from "./objetosSeta.ts";
import { corpoJson, ErroPayloadGrande, origemPermitida } from "./seguranca.ts";
import type { SalaProjetos } from "./ws.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(RAIZ, "web", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(res: ServerResponse, status: number, corpo: unknown, cookie?: string): void {
  const texto = JSON.stringify(corpo);
  const cabecalhos: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  if (cookie) cabecalhos["set-cookie"] = cookie;
  res.writeHead(status, cabecalhos);
  res.end(texto);
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
  // guarda contra path traversal: nunca deixa o caminho escapar de web/dist.
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

type Contexto = { usuarioId: string; nome: string; papel: Papel };

/** Sessão válida **e** membership no projeto — sem membership devolve 404, nunca 403. */
async function exigirProjeto(
  req: IncomingMessage,
  res: ServerResponse,
  pool: Pool,
  projetoId: string,
): Promise<Contexto | null> {
  if (!RE_UUID.test(projetoId)) {
    json(res, 404, { erro: "projeto não encontrado" });
    return null;
  }
  const sessao = await resolverSessao(pool, req);
  if (!sessao) {
    json(res, 401, { erro: "não autenticado" });
    return null;
  }
  const papel = await resolverMembership(pool, sessao.usuario.id, projetoId);
  if (!papel) {
    json(res, 404, { erro: "projeto não encontrado" });
    return null;
  }
  return { usuarioId: sessao.usuario.id, nome: sessao.usuario.nome, papel };
}

/** Só a forma: a coerência tarefa↔estado é normalizada na escrita, não exigida do cliente. */
function execucaoValida(valor: unknown): boolean {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const { tarefa, estado } = valor as { tarefa?: unknown; estado?: unknown };
  if (tarefa !== undefined && typeof tarefa !== "boolean") return false;
  return estado === undefined || estado === null || ESTADOS_EXECUCAO.includes(estado as EstadoExecucao);
}

function exigirEscrita(res: ServerResponse, papel: Papel): boolean {
  if (papel === "leitor") {
    json(res, 403, { erro: "leitor não pode escrever" });
    return false;
  }
  return true;
}

export function criarServidor(pool: Pool, sala: SalaProjetos): Server {
  return createServer(async (req, res) => {
    try {
      await lidar(req, res, pool, sala);
    } catch (e) {
      tratarErro(res, e);
    }
  });
}

async function lidar(req: IncomingMessage, res: ServerResponse, pool: Pool, sala: SalaProjetos): Promise<void> {
  const url = new URL(req.url ?? "/", "http://local");
  const rota = url.pathname;
  const metodo = req.method ?? "GET";

  if (!rota.startsWith("/api/")) return servirEstatico(res, rota);

  // CSRF: SameSite=Lax cobre navegação de topo, não toda variação — Origin cobre o resto.
  if (metodo !== "GET" && !origemPermitida(req.headers.origin, req.headers.host)) {
    return json(res, 403, { erro: "origem não permitida" });
  }

  if (rota === "/api/auth/registrar" && metodo === "POST") return registrar(req, res, pool);
  if (rota === "/api/auth/entrar" && metodo === "POST") return entrar(req, res, pool);
  if (rota === "/api/auth/sair" && metodo === "POST") return sair(req, res, pool, sala);
  if (rota === "/api/auth/eu" && metodo === "GET") return eu(req, res, pool);

  if (rota === "/api/categorias" && metodo === "GET") {
    const sessao = await resolverSessao(pool, req);
    if (!sessao) return json(res, 401, { erro: "não autenticado" });
    return json(res, 200, await listarCategorias(pool));
  }

  if (rota === "/api/projetos" && metodo === "GET") {
    const sessao = await resolverSessao(pool, req);
    if (!sessao) return json(res, 401, { erro: "não autenticado" });
    return json(res, 200, await listarProjetos(pool, sessao.usuario.id));
  }

  if (rota === "/api/projetos" && metodo === "POST") {
    const sessao = await resolverSessao(pool, req);
    if (!sessao) return json(res, 401, { erro: "não autenticado" });
    const { nome, categoria_id } = (await corpoJson(req)) as { nome?: string; categoria_id?: string };
    if (!nome || !categoria_id) return json(res, 400, { erro: "nome e categoria_id obrigatórios" });
    const r = await criarProjeto(pool, sessao.usuario.id, nome, categoria_id);
    if ("erro" in r) return json(res, 400, r);
    return json(res, 201, r);
  }

  const mProjeto = rota.match(/^\/api\/projetos\/([^/]+)$/);
  if (mProjeto && metodo === "DELETE") {
    const projetoId = mProjeto[1];
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    if (ctx.papel !== "dono") return json(res, 403, { erro: "só o dono apaga o projeto" });
    await apagarProjeto(pool, projetoId);
    sala.fecharProjeto(projetoId);
    return json(res, 200, { ok: true });
  }

  const mGrafo = rota.match(/^\/api\/projetos\/([^/]+)\/grafo$/);
  if (mGrafo && metodo === "GET") {
    const projetoId = mGrafo[1];
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    const grafo = await montarGrafo(pool, projetoId);
    return json(res, 200, grafo);
  }

  const mExportacao = rota.match(/^\/api\/projetos\/([^/]+)\/exportacao$/);
  if (mExportacao && metodo === "GET") {
    const projetoId = mExportacao[1];
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    const snapshot = await montarExportacao(pool, projetoId);
    // O projeto pode ter sido apagado entre a guarda e o BEGIN; continua sem revelar nada.
    if (!snapshot) return json(res, 404, { erro: "projeto não encontrado" });
    return json(res, 200, snapshot);
  }

  const mBusca = rota.match(/^\/api\/projetos\/([^/]+)\/busca$/);
  if (mBusca && metodo === "GET") {
    const projetoId = mBusca[1];
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    return json(res, 200, await buscarNos(pool, projetoId, url.searchParams.get("q") ?? ""));
  }

  const mNotas = rota.match(/^\/api\/projetos\/([^/]+)\/notas$/);
  if (mNotas) {
    const projetoId = mNotas[1];
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;

    if (metodo === "GET") return json(res, 200, await listarNotas(pool, projetoId));

    if (metodo === "POST") {
      if (!exigirEscrita(res, ctx.papel)) return;
      const { conteudo, x, y } = (await corpoJson(req)) as { conteudo?: string; x?: number; y?: number };
      if (typeof x !== "number" || typeof y !== "number") return json(res, 400, { erro: "x e y obrigatórios" });
      const nota = await criarNota(pool, projetoId, ctx.usuarioId, conteudo ?? "", x, y);
      sala.transmitir(projetoId, { t: "nota-criada", nota });
      return json(res, 201, nota);
    }
  }

  const mNota = rota.match(/^\/api\/projetos\/([^/]+)\/notas\/([^/]+)$/);
  if (mNota) {
    const [, projetoId, id] = mNota;
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    if (!exigirEscrita(res, ctx.papel)) return;
    // Id não-uuid faria o Postgres levantar erro de sintaxe em vez de dar 404.
    if (!RE_UUID.test(id)) return json(res, 404, { erro: "nota não encontrada" });

    if (metodo === "PATCH") {
      const nota = await atualizarNota(pool, projetoId, id, (await corpoJson(req)) as PatchNota);
      if (!nota) return json(res, 404, { erro: "nota não encontrada" });
      sala.transmitir(projetoId, { t: "nota-mudou", nota });
      return json(res, 200, nota);
    }

    if (metodo === "DELETE") {
      const nota = await apagarNota(pool, projetoId, id);
      if (!nota) return json(res, 404, { erro: "nota não encontrada" });
      sala.transmitir(projetoId, { t: "nota-apagada", nota });
      return json(res, 200, { ok: true });
    }
  }

  const mObjetosSeta = rota.match(/^\/api\/projetos\/([^/]+)\/objetos-seta$/);
  if (mObjetosSeta && metodo === "POST") {
    const projetoId = mObjetosSeta[1];
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    if (!exigirEscrita(res, ctx.papel)) return;
    const dados = (await corpoJson(req)) as unknown;
    if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
      return json(res, 400, { erro: "tipo ou pontos de seta inválidos" });
    }
    const { tipo, pontos } = dados as { tipo?: unknown; pontos?: unknown };
    if (!ehTipoObjetoSeta(tipo) || !pontosObjetoSetaValidos(pontos, tipo)) {
      return json(res, 400, { erro: "tipo ou pontos de seta inválidos" });
    }
    const seta = await criarObjetoSeta(pool, projetoId, ctx.usuarioId, tipo, pontos);
    sala.transmitir(projetoId, { t: "seta-criada", seta });
    return json(res, 201, seta);
  }

  const mObjetoSeta = rota.match(/^\/api\/projetos\/([^/]+)\/objetos-seta\/([^/]+)$/);
  if (mObjetoSeta) {
    const [, projetoId, id] = mObjetoSeta;
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    if (!exigirEscrita(res, ctx.papel)) return;
    if (!RE_UUID.test(id)) return json(res, 404, { erro: "objeto de seta não encontrado" });

    if (metodo === "PATCH") {
      const existente = await buscarObjetoSeta(pool, projetoId, id);
      if (!existente) return json(res, 404, { erro: "objeto de seta não encontrado" });
      const dados = (await corpoJson(req)) as unknown;
      if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        return json(res, 400, { erro: "tipo ou pontos de seta inválidos" });
      }
      const patch = dados as { tipo?: unknown; pontos?: unknown };
      const tipo = "tipo" in patch ? patch.tipo : existente.tipo;
      const pontos = "pontos" in patch ? patch.pontos : existente.pontos;
      if (!ehTipoObjetoSeta(tipo) || !pontosObjetoSetaValidos(pontos, tipo)) {
        return json(res, 400, { erro: "tipo ou pontos de seta inválidos" });
      }
      const seta = await atualizarObjetoSeta(pool, projetoId, id, tipo, pontos as Posicao[]);
      // A leitura acima achou, mas uma exclusão concorrente pode ganhar a corrida.
      if (!seta) return json(res, 404, { erro: "objeto de seta não encontrado" });
      sala.transmitir(projetoId, { t: "seta-mudou", seta });
      return json(res, 200, seta);
    }

    if (metodo === "DELETE") {
      const seta = await apagarObjetoSeta(pool, projetoId, id);
      if (!seta) return json(res, 404, { erro: "objeto de seta não encontrado" });
      sala.transmitir(projetoId, { t: "seta-apagada", seta });
      return json(res, 200, { ok: true });
    }
  }

  const mNos = rota.match(/^\/api\/projetos\/([^/]+)\/nos$/);
  if (mNos && metodo === "POST") {
    const projetoId = mNos[1];
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    if (!exigirEscrita(res, ctx.papel)) return;
    const { titulo, campos, categoria_id } = (await corpoJson(req)) as {
      titulo?: string;
      campos?: Record<string, unknown>;
      categoria_id?: string;
    };
    if (!titulo) return json(res, 400, { erro: "titulo obrigatório" });
    const projeto = await buscarProjeto(pool, projetoId);
    // Sem `categoria_id` explícito cai na principal do projeto — mantém o comportamento de
    // antes de o projeto passar a misturar categorias.
    const categoria = await categoriaDoProjeto(pool, projetoId, categoria_id ?? projeto!.categoriaId);
    if (!categoria) return json(res, 400, { erro: "categoria não pertence a este projeto" });
    const { id } = await criarNo(pool, projetoId, ctx.usuarioId, titulo, campos, categoria);
    const no = await buscarNo(pool, projetoId, id);
    sala.transmitir(projetoId, { t: "no-criado", no: no! });
    return json(res, 201, { id });
  }

  const mNoCorpo = rota.match(/^\/api\/projetos\/([^/]+)\/nos\/([^/]+)\/corpo$/);
  if (mNoCorpo && metodo === "PUT") {
    const [, projetoId, id] = mNoCorpo;
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    if (!exigirEscrita(res, ctx.papel)) return;
    const { corpo, versao } = (await corpoJson(req)) as { corpo?: string; versao?: number };
    if (typeof corpo !== "string" || typeof versao !== "number") {
      return json(res, 400, { erro: "corpo e versao obrigatórios" });
    }
    const r = await atualizarCorpo(pool, projetoId, id, corpo, versao);
    if (r.status === "nao-encontrado") return json(res, 404, { erro: "nó não encontrado" });
    if (r.status === "conflito") {
      return json(res, 409, { erro: "versão divergente", versao: r.versao, corpo: r.corpo });
    }
    const no = await buscarNo(pool, projetoId, id);
    sala.transmitir(projetoId, { t: "no-mudou", no: no! });
    return json(res, 200, { ok: true, versao: r.versao });
  }

  const mNo = rota.match(/^\/api\/projetos\/([^/]+)\/nos\/([^/]+)$/);
  if (mNo) {
    const [, projetoId, id] = mNo;
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;

    if (metodo === "GET") {
      const no = await buscarNo(pool, projetoId, id);
      if (!no) return json(res, 404, { erro: "nó não encontrado" });
      return json(res, 200, no);
    }

    if (metodo === "PATCH") {
      if (!exigirEscrita(res, ctx.papel)) return;
      const dados = (await corpoJson(req)) as unknown;
      if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
        return json(res, 400, { erro: "corpo inválido" });
      }
      const { campos, titulo, execucao } = dados as { campos?: unknown; titulo?: unknown; execucao?: unknown };
      if (titulo !== undefined && (typeof titulo !== "string" || !titulo.trim())) {
        return json(res, 400, { erro: "titulo obrigatório" });
      }
      if (campos !== undefined && (!campos || typeof campos !== "object" || Array.isArray(campos))) {
        return json(res, 400, { erro: "campos inválidos" });
      }
      if (execucao !== undefined && !execucaoValida(execucao)) return json(res, 400, { erro: "execucao inválida" });
      if (titulo === undefined && campos === undefined && execucao === undefined) {
        return json(res, 400, { erro: "campos obrigatório" });
      }
      // Valida contra a categoria DO NÓ, não a do projeto: um projeto mistura várias.
      const atual = await buscarNo(pool, projetoId, id);
      if (!atual) return json(res, 404, { erro: "nó não encontrado" });
      const categoria = await buscarCategoriaPorId(pool, atual.categoria_id);
      const no = await atualizarNo(
        pool,
        projetoId,
        atual.id,
        {
          ...(titulo === undefined ? {} : { titulo: (titulo as string).trim() }),
          ...(campos === undefined ? {} : { campos: campos as Record<string, unknown> }),
          ...(execucao === undefined ? {} : { execucao: execucao as PatchNo["execucao"] }),
        },
        categoria!,
      );
      // A leitura acima achou, mas uma exclusão concorrente pode ganhar a corrida.
      if (!no) return json(res, 404, { erro: "nó não encontrado" });
      sala.transmitir(projetoId, { t: "no-mudou", no });
      return json(res, 200, { ok: true, no });
    }

    if (metodo === "DELETE") {
      if (!exigirEscrita(res, ctx.papel)) return;
      const r = await apagarNo(pool, projetoId, id);
      if (!r) return json(res, 404, { erro: "nó não encontrado" });
      for (const aresta of r.arestasApagadas) {
        sala.transmitir(projetoId, { t: "aresta-apagada", aresta });
      }
      sala.transmitir(projetoId, { t: "no-apagado", no: r.no });
      return json(res, 200, { ok: true });
    }
  }

  const mArestas = rota.match(/^\/api\/projetos\/([^/]+)\/arestas$/);
  if (mArestas && metodo === "POST") {
    const projetoId = mArestas[1];
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    if (!exigirEscrita(res, ctx.papel)) return;
    const { de, para, tipo } = (await corpoJson(req)) as { de?: string; para?: string; tipo?: string | null };
    if (!de || !para) return json(res, 400, { erro: "de e para obrigatórios" });
    const r = await criarAresta(pool, projetoId, de, para, tipo);
    if ("conflito" in r) return json(res, 409, { erro: "já existe aresta entre esses nós" });
    if ("naoEncontrada" in r) return json(res, 404, { erro: "nó não encontrado" });
    sala.transmitir(projetoId, {
      t: "aresta-criada",
      aresta: { id: r.id, de, para, tipo: tipo ?? undefined, campos: {} },
    });
    return json(res, 201, { id: r.id });
  }

  const mAresta = rota.match(/^\/api\/projetos\/([^/]+)\/arestas\/([^/]+)$/);
  if (mAresta) {
    const [, projetoId, id] = mAresta;
    const ctx = await exigirProjeto(req, res, pool, projetoId);
    if (!ctx) return;
    if (!exigirEscrita(res, ctx.papel)) return;
    // `id` é UUID gerado pelo banco. Validar antes da query evita erro de cast no Postgres.
    if (!RE_UUID.test(id)) return json(res, 404, { erro: "aresta não encontrada" });

    if (metodo === "PATCH") {
      const patch = (await corpoJson(req)) as {
        quando?: string | null;
        tipo?: string | null;
        campos?: Record<string, unknown>;
      };
      const aresta = await atualizarAresta(pool, projetoId, id, patch);
      if (!aresta) return json(res, 404, { erro: "aresta não encontrada" });
      sala.transmitir(projetoId, { t: "aresta-mudou", aresta });
      return json(res, 200, { ok: true });
    }

    if (metodo === "DELETE") {
      const aresta = await apagarAresta(pool, projetoId, id);
      if (!aresta) return json(res, 404, { erro: "aresta não encontrada" });
      sala.transmitir(projetoId, { t: "aresta-apagada", aresta });
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { erro: "rota não encontrada" });
}

async function registrar(req: IncomingMessage, res: ServerResponse, pool: Pool): Promise<void> {
  const { email, nome, senha } = (await corpoJson(req)) as { email?: string; nome?: string; senha?: string };
  if (!email || !nome || !senha) return json(res, 400, { erro: "email, nome e senha obrigatórios" });
  if (!RE_EMAIL.test(email)) return json(res, 400, { erro: "email inválido" });
  if (senha.length < 8) return json(res, 400, { erro: "senha precisa de ao menos 8 caracteres" });

  const senhaHash = await hashSenha(senha);
  let usuario: { id: string; nome: string; email: string };
  try {
    const r = await pool.query<{ id: string }>(
      "insert into usuarios (email, nome, senha_hash) values ($1, $2, $3) returning id",
      [email, nome, senhaHash],
    );
    usuario = { id: r.rows[0].id, nome, email };
  } catch (erro) {
    if ((erro as { code?: string }).code === "23505") {
      return json(res, 409, { erro: "email já cadastrado" });
    }
    throw erro;
  }
  const token = await criarSessao(pool, usuario.id);
  return json(res, 201, { usuario }, serializarCookieSessao(token));
}

async function entrar(req: IncomingMessage, res: ServerResponse, pool: Pool): Promise<void> {
  const { email, senha } = (await corpoJson(req)) as { email?: string; senha?: string };
  if (!email || !senha) return json(res, 400, { erro: "email e senha obrigatórios" });

  const ip = req.socket.remoteAddress ?? "desconhecido";
  if (loginLimitado(`${ip}:${email}`)) return json(res, 429, { erro: "muitas tentativas, tente mais tarde" });

  const r = await pool.query<{ id: string; nome: string; senha_hash: string }>(
    "select id, nome, senha_hash from usuarios where email = $1",
    [email],
  );
  const linha = r.rows[0];
  // mensagem genérica dos dois lados: não revela se foi o email ou a senha que errou.
  if (!linha || !(await verificarSenha(senha, linha.senha_hash))) {
    return json(res, 401, { erro: "credenciais inválidas" });
  }
  const token = await criarSessao(pool, linha.id);
  return json(res, 200, { usuario: { id: linha.id, nome: linha.nome, email } }, serializarCookieSessao(token));
}

async function sair(req: IncomingMessage, res: ServerResponse, pool: Pool, sala: SalaProjetos): Promise<void> {
  const sessao = await resolverSessao(pool, req);
  const token = lerCookie(req.headers.cookie, "sessao");
  if (sessao && token) {
    await apagarSessao(pool, token);
    sala.fecharSessao(sessao.sessaoId);
  }
  return json(res, 200, { ok: true }, serializarCookieLimpo());
}

async function eu(req: IncomingMessage, res: ServerResponse, pool: Pool): Promise<void> {
  const sessao = await resolverSessao(pool, req);
  if (!sessao) return json(res, 401, { erro: "não autenticado" });
  return json(res, 200, { usuario: sessao.usuario });
}

function tratarErro(res: ServerResponse, e: unknown): void {
  if (e instanceof ErroPayloadGrande) return json(res, 413, { erro: "corpo muito grande" });
  if (e instanceof SyntaxError) return json(res, 400, { erro: "JSON inválido" });
  console.error(e);
  json(res, 500, { erro: "erro interno do servidor" });
}
