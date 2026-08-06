import type { MsgCliente, MsgServidor } from "../../core/tipos.ts";
import { criarLimitador } from "./limitador.ts";

const INTERVALO_ARRASTANDO_MS = 1000 / 30;
const RECONEXAO_MAX_MS = 10_000;

export type ConexaoWS = {
  enviar: (msg: MsgCliente) => void;
  /** Limitado a ~30/s (contrato) — não emite por frame de rAF, emite por tempo. */
  enviarArrastando: (no: string, x: number, y: number) => void;
  fechar: () => void;
};

type Handlers = {
  /** Toda conexão bem-sucedida, inclusive reconexão: quem chama deve refazer GET /grafo. */
  aoConectar: () => void;
  aoReceber: (msg: MsgServidor) => void;
};

export function conectarWS(projetoId: string, handlers: Handlers): ConexaoWS {
  const protocolo = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocolo}//${location.host}/ws?projeto=${encodeURIComponent(projetoId)}`;
  const podeEnviarArrastando = criarLimitador(INTERVALO_ARRASTANDO_MS);

  let socket: WebSocket | null = null;
  let fechadoPeloCliente = false;
  let tentativa = 0;
  let timerReconexao: number | undefined;

  function conectar() {
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      tentativa = 0;
      handlers.aoConectar();
    });
    socket.addEventListener("message", (evento) => {
      try {
        handlers.aoReceber(JSON.parse(evento.data as string) as MsgServidor);
      } catch {
        // mensagem malformada: ignora, não derruba a conexão por causa dela
      }
    });
    socket.addEventListener("close", () => {
      if (fechadoPeloCliente) return;
      const espera = Math.min(1000 * 2 ** tentativa, RECONEXAO_MAX_MS);
      tentativa++;
      timerReconexao = window.setTimeout(conectar, espera);
    });
  }
  conectar();

  function enviar(msg: MsgCliente) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }

  return {
    enviar,
    enviarArrastando(no, x, y) {
      if (!podeEnviarArrastando(Date.now())) return;
      enviar({ t: "arrastando", no, x, y });
    },
    fechar() {
      fechadoPeloCliente = true;
      window.clearTimeout(timerReconexao);
      socket?.close();
    },
  };
}
