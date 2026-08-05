#!/usr/bin/env -S node --experimental-strip-types
import { resolve } from "node:path";
import { criarServidor } from "./rotas.ts";
import { observar } from "./watcher.ts";

const [comando, alvo] = process.argv.slice(2);

if (comando !== "serve" || !alvo) {
  console.error("uso: grapydown serve <pasta>");
  process.exit(1);
}

const dir = resolve(alvo);
const porta = Number(process.env.PORTA ?? 5174);

observar(dir);
// 127.0.0.1 e nao 0.0.0.0: nao ha autenticacao nenhuma, e as rotas escrevem e apagam
// arquivos. Ninguem na mesma rede pode alcancar a pasta do usuario.
criarServidor(dir).listen(porta, "127.0.0.1", () => {
  console.log(`grapydown  ${dir}\n           http://localhost:${porta}`);
});
