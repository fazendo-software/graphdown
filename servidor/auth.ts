import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { IncomingMessage } from "node:http";
import type { Pool } from "./db.ts";
import type { Usuario } from "../core/tipos.ts";

const scrypt = promisify(scryptCb) as (
  senha: string,
  sal: Buffer,
  tamanho: number,
  params: { N: number; r: number; p: number },
) => Promise<Buffer>;

// N=16384/r=8/p=1: parâmetros do scrypt recomendados pra login web, sem exigir toolchain
// nativa na imagem (ver fundacao/auth-deploy).
const PARAMS = { N: 16384, r: 8, p: 1 };
const TAMANHO_HASH = 64;
const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const derivada = await scrypt(senha, sal, TAMANHO_HASH, PARAMS);
  return `${sal.toString("hex")}:${derivada.toString("hex")}`;
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  const [salHex, hashHex] = hash.split(":");
  if (!salHex || !hashHex) return false;
  const sal = Buffer.from(salHex, "hex");
  const esperada = Buffer.from(hashHex, "hex");
  const derivada = await scrypt(senha, sal, esperada.length, PARAMS);
  return derivada.length === esperada.length && timingSafeEqual(derivada, esperada);
}

function segredoCookie(): string {
  const s = process.env.COOKIE_SECRET;
  if (!s) throw new Error("COOKIE_SECRET não definida");
  return s;
}

function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

/** HMAC em vez de sha256 puro: o hash guardado depende de COOKIE_SECRET, não só do token. */
function hashToken(token: string): string {
  return createHmac("sha256", segredoCookie()).update(token).digest("hex");
}

function cookieSeguro(): boolean {
  return process.env.NODE_ENV === "production";
}

export function serializarCookieSessao(token: string): string {
  const maxAge = Math.floor(DURACAO_SESSAO_MS / 1000);
  const seguro = cookieSeguro() ? "; Secure" : "";
  return `sessao=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${seguro}`;
}

export function serializarCookieLimpo(): string {
  const seguro = cookieSeguro() ? "; Secure" : "";
  return `sessao=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${seguro}`;
}

export function lerCookie(cabecalho: string | undefined, nome: string): string | undefined {
  if (!cabecalho) return undefined;
  for (const parte of cabecalho.split(";")) {
    const i = parte.indexOf("=");
    if (i === -1) continue;
    if (parte.slice(0, i).trim() === nome) {
      try {
        return decodeURIComponent(parte.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export async function criarSessao(pool: Pool, usuarioId: string): Promise<string> {
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
  await pool.query(
    "insert into sessoes (token_hash, usuario_id, expira_em) values ($1, $2, $3)",
    [hashToken(token), usuarioId, expiraEm],
  );
  return token;
}

export async function apagarSessao(pool: Pool, token: string): Promise<void> {
  await pool.query("delete from sessoes where token_hash = $1", [hashToken(token)]);
}

export type SessaoResolvida = { usuario: Usuario; sessaoId: string };

/** Resolve a sessão a partir do cookie da requisição. `null` se ausente, expirada ou revogada. */
export async function resolverSessao(pool: Pool, req: IncomingMessage): Promise<SessaoResolvida | null> {
  const token = lerCookie(req.headers.cookie, "sessao");
  if (!token) return null;
  const r = await pool.query<{ id: string; usuario_id: string; nome: string; email: string }>(
    `select s.id, s.usuario_id, u.nome, u.email
       from sessoes s join usuarios u on u.id = s.usuario_id
      where s.token_hash = $1 and s.expira_em > now()`,
    [hashToken(token)],
  );
  const linha = r.rows[0];
  if (!linha) return null;
  return { usuario: { id: linha.usuario_id, nome: linha.nome, email: linha.email }, sessaoId: linha.id };
}

const tentativas = new Map<string, { contagem: number; expira: number }>();
const JANELA_MS = 60_000;
const LIMITE = 10;

/** Rate limit em memória (instância única, ver fundacao/auth-deploy). `true` = bloqueado. */
export function loginLimitado(chave: string): boolean {
  const agora = Date.now();
  const registro = tentativas.get(chave);
  if (!registro || registro.expira < agora) {
    tentativas.set(chave, { contagem: 1, expira: agora + JANELA_MS });
    return false;
  }
  registro.contagem++;
  return registro.contagem > LIMITE;
}
