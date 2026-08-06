import type { IncomingMessage } from "node:http";

export class ErroPayloadGrande extends Error {}

const LIMITE_PADRAO = 1_000_000; // 1MB — o corpoJson antigo acumulava sem teto (DoS trivial)

export function corpoJson(req: IncomingMessage, limite = LIMITE_PADRAO): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const pedacos: Buffer[] = [];
    let total = 0;
    req.on("data", (p: Buffer) => {
      total += p.length;
      if (total > limite) {
        // Não destrói a conexão: só para de acumular e deixa a resposta 413 ser escrita.
        // Destruir aqui derruba o socket antes do cliente ler a resposta (ECONNRESET).
        reject(new ErroPayloadGrande("corpo excede o limite de tamanho"));
        return;
      }
      pedacos.push(p);
    });
    req.on("end", () => {
      if (pedacos.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(pedacos).toString("utf8")) as Record<string, unknown>);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/** Compara `Origin` contra o host da própria requisição — mesma checagem no upgrade do WS. */
export function origemPermitida(origem: string | undefined, host: string | undefined): boolean {
  if (!origem) return true; // sem Origin: cliente não-browser (curl, health check)
  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}
