import type { ServerResponse } from "node:http";
import { watch } from "chokidar";
import { readFile } from "node:fs/promises";
import { ehEscritaPropria } from "./arquivos.ts";

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

export function observar(dir: string): void {
  // Sem `ignored`: o padrao de ponto casa contra o caminho absoluto, entao servir
  // ~/.notes/processos desligaria o watcher inteiro em silencio. `depth: 0` ja impede
  // descer em .grapydown/, e o filtro de .md abaixo cobre o resto.
  watch(dir, { ignoreInitial: true, depth: 0 }).on(
    "all",
    async (evento, caminho) => {
      if (!caminho.endsWith(".md")) return;
      if (evento === "change" || evento === "add") {
        try {
          // Nossa propria escrita nao pode disparar reload — senao vira laco.
          if (ehEscritaPropria(await readFile(caminho, "utf8"))) return;
        } catch {
          return;
        }
      }
      avisarTodos();
    },
  );
}
