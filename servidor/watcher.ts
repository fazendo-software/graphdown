import type { ServerResponse } from "node:http";

const clientes = new Set<ServerResponse>();

export function assinarEventos(res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write(": conectado\n\n");
  clientes.add(res);
  res.on("close", () => clientes.delete(res));
}

export function avisarTodos(): void {
  for (const res of clientes) res.write("event: grafo-mudou\ndata: {}\n\n");
}
