import { useEffect, useRef, useState } from "react";
import type { Projeto, Usuario } from "../../core/tipos.ts";
import { apiProjetos } from "./api.ts";

type Props = {
  titulo: string;
  projetoId: string;
  usuario: Usuario;
  podeRenomear: boolean;
  aoTrocar: (projeto: Projeto) => void;
  aoNovoProjeto: () => void;
  aoRenomear: () => void;
  aoSairDaConta: () => void;
};

/** Dropdown do projeto aberto: trocar sem desmontar o canvas. A criação continua morando
 * no `SeletorProjetos` — daqui só se chega até lá, sem duplicar o formulário. */
export function MenuProjeto({ titulo, projetoId, usuario, podeRenomear, aoTrocar, aoNovoProjeto, aoRenomear, aoSairDaConta }: Props) {
  const [aberto, setAberto] = useState(false);
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    apiProjetos.listar().then(setProjetos).catch(() => setProjetos([]));
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div className="menu-projeto" ref={caixa}>
      <button type="button" className="menu-alvo" aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <strong>{titulo || "carregando…"}</strong>
        <span aria-hidden="true">▾</span>
      </button>
      {aberto ? (
        <div className="menu-caixa" role="menu">
          {!projetos ? (
            <p className="vazio">carregando…</p>
          ) : (
            <ul className="lista">
              {projetos.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-current={p.id === projetoId}
                    onClick={() => {
                      setAberto(false);
                      if (p.id !== projetoId) aoTrocar(p);
                    }}
                  >
                    {p.nome} <span className="papel">{p.papel}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="menu-rodape">
            <button type="button" onClick={aoNovoProjeto}>
              + novo projeto
            </button>
            {podeRenomear ? <button type="button" onClick={() => { setAberto(false); aoRenomear(); }}>renomear</button> : null}
            <span className="quem">{usuario.nome}</span>
            <button type="button" onClick={aoSairDaConta}>
              sair
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
