import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { Pool } from "pg";
import type { MsgCliente, MsgServidor, Papel } from "../core/tipos.ts";
import { resolverSessao } from "./auth.ts";
import { resolverMembership } from "./membros.ts";
import { atualizarPosicao } from "./nos.ts";
import { origemPermitida } from "./seguranca.ts";

type Conexao = { usuarioId: string; nome: string; papel: Papel; sessaoId: string; editando: string | null };

const CODIGO_REVOGADO = 4001;

export class SalaProjetos {
  #pool: Pool;
  #salas = new Map<string, Map<WebSocket, Conexao>>();
  #wss = new WebSocketServer({ noServer: true });

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  anexar(servidor: HttpServer): void {
    servidor.on("upgrade", (req, socket, head) => {
      this.#lidarComUpgrade(req, socket, head).catch(() => socket.destroy());
    });
  }

  async #lidarComUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const url = new URL(req.url ?? "", "http://local");
    if (url.pathname !== "/ws") return recusar(socket, 404);
    const projetoId = url.searchParams.get("projeto");
    if (!projetoId) return recusar(socket, 400);
    if (!origemPermitida(req.headers.origin, req.headers.host)) return recusar(socket, 403);

    const sessao = await resolverSessao(this.#pool, req);
    if (!sessao) return recusar(socket, 401);
    const papel = await resolverMembership(this.#pool, sessao.usuario.id, projetoId);
    if (!papel) return recusar(socket, 404);

    this.#wss.handleUpgrade(req, socket, head, (ws) => {
      this.#conectar(ws, projetoId, {
        usuarioId: sessao.usuario.id,
        nome: sessao.usuario.nome,
        papel,
        sessaoId: sessao.sessaoId,
        editando: null,
      });
    });
  }

  #conectar(ws: WebSocket, projetoId: string, conexao: Conexao): void {
    const sala = this.#salaDe(projetoId);
    sala.set(ws, conexao);
    this.#transmitirPresenca(projetoId);

    ws.on("message", (dados) => {
      this.#lidarComMensagem(ws, projetoId, conexao, dados.toString()).catch(() => {
        enviar(ws, { t: "erro", mensagem: "erro interno" });
      });
    });
    ws.on("close", () => {
      sala.delete(ws);
      if (sala.size === 0) this.#salas.delete(projetoId);
      else this.#transmitirPresenca(projetoId);
    });
  }

  async #lidarComMensagem(ws: WebSocket, projetoId: string, conexao: Conexao, texto: string): Promise<void> {
    let msg: MsgCliente;
    try {
      msg = JSON.parse(texto) as MsgCliente;
    } catch {
      return enviar(ws, { t: "erro", mensagem: "JSON inválido" });
    }

    if (msg.t === "arrastando") {
      if (conexao.papel === "leitor") return enviar(ws, { t: "erro", mensagem: "leitor não pode escrever" });
      if (typeof msg.no !== "string" || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      this.transmitir(projetoId, { t: "arrastando", no: msg.no, x: msg.x, y: msg.y, por: conexao.usuarioId }, ws);
      return;
    }

    if (msg.t === "soltou") {
      if (conexao.papel === "leitor") return enviar(ws, { t: "erro", mensagem: "leitor não pode escrever" });
      if (typeof msg.no !== "string" || !Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      const ok = await atualizarPosicao(this.#pool, projetoId, msg.no, msg.x, msg.y);
      if (ok) this.transmitir(projetoId, { t: "posicao", no: msg.no, x: msg.x, y: msg.y });
      return;
    }

    if (msg.t === "editando") {
      conexao.editando = typeof msg.no === "string" ? msg.no : null;
      this.#transmitirPresenca(projetoId);
      return;
    }
  }

  #salaDe(projetoId: string): Map<WebSocket, Conexao> {
    let sala = this.#salas.get(projetoId);
    if (!sala) {
      sala = new Map();
      this.#salas.set(projetoId, sala);
    }
    return sala;
  }

  #transmitirPresenca(projetoId: string): void {
    const sala = this.#salas.get(projetoId);
    if (!sala) return;
    const usuarios = [...sala.values()].map((c) => ({ id: c.usuarioId, nome: c.nome, editando: c.editando }));
    this.transmitir(projetoId, { t: "presenca", usuarios });
  }

  /** Chamado pelas rotas HTTP após commitar uma mutação de estrutura, pra levar o diff à sala. */
  transmitir(projetoId: string, msg: MsgServidor, exceto?: WebSocket): void {
    const sala = this.#salas.get(projetoId);
    if (!sala) return;
    for (const ws of sala.keys()) {
      if (ws !== exceto) enviar(ws, msg);
    }
  }

  /** Logout: fecha ativamente os sockets abertos daquela sessão — revogação não espera o
   * cliente perceber sozinho. */
  fecharSessao(sessaoId: string): void {
    for (const sala of this.#salas.values()) {
      for (const [ws, conexao] of sala) {
        if (conexao.sessaoId === sessaoId) ws.close(CODIGO_REVOGADO, "acesso revogado");
      }
    }
  }

  /** Projeto apagado: ninguém deveria continuar com o socket aberto contra ele. */
  fecharProjeto(projetoId: string): void {
    const sala = this.#salas.get(projetoId);
    if (!sala) return;
    for (const ws of sala.keys()) ws.close(CODIGO_REVOGADO, "acesso revogado");
    this.#salas.delete(projetoId);
  }
}

function enviar(ws: WebSocket, msg: MsgServidor): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function recusar(socket: Duplex, status: number): void {
  const textos: Record<number, string> = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found" };
  socket.write(`HTTP/1.1 ${status} ${textos[status] ?? "Error"}\r\n\r\n`);
  socket.destroy();
}
