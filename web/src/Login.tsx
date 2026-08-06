import { useState } from "react";
import type { Usuario } from "../../core/tipos.ts";
import { apiAuth } from "./api.ts";

type Props = { aoEntrar: (usuario: Usuario) => void };

export function Login({ aoEntrar }: Props) {
  const [modo, setModo] = useState<"entrar" | "registrar">("entrar");
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [falha, setFalha] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setFalha(null);
    setEnviando(true);
    try {
      const { usuario } =
        modo === "entrar" ? await apiAuth.entrar(email, senha) : await apiAuth.registrar(email, nome, senha);
      aoEntrar(usuario);
    } catch (err) {
      setFalha((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tela-auth">
      <form className="cartao" onSubmit={(e) => void enviar(e)}>
        <h1>grapydown</h1>
        <div className="abas" role="group" aria-label="entrar ou criar conta">
          <button type="button" aria-pressed={modo === "entrar"} onClick={() => setModo("entrar")}>
            entrar
          </button>
          <button type="button" aria-pressed={modo === "registrar"} onClick={() => setModo("registrar")}>
            criar conta
          </button>
        </div>

        <label htmlFor="auth-email">email</label>
        <input
          id="auth-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {modo === "registrar" ? (
          <>
            <label htmlFor="auth-nome">nome</label>
            <input id="auth-nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
          </>
        ) : null}

        <label htmlFor="auth-senha">senha</label>
        <input
          id="auth-senha"
          type="password"
          required
          minLength={8}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        {falha ? <p className="erro">{falha}</p> : null}

        <button type="submit" disabled={enviando}>
          {modo === "entrar" ? "entrar" : "criar conta"}
        </button>
      </form>
    </div>
  );
}
