import { useEffect, useState } from "react";
import type { CategoriaResumo, Projeto, Usuario } from "../../core/tipos.ts";
import { apiCategorias, apiProjetos } from "./api.ts";

type Props = {
  usuario: Usuario;
  aoEscolher: (projeto: Projeto) => void;
  aoSairDaConta: () => void;
};

export function SeletorProjetos({ usuario, aoEscolher, aoSairDaConta }: Props) {
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [categorias, setCategorias] = useState<CategoriaResumo[]>([]);
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [falha, setFalha] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    apiProjetos.listar().then(setProjetos).catch((e: Error) => setFalha(e.message));
    apiCategorias
      .listar()
      .then((lista) => {
        setCategorias(lista);
        setCategoriaId((atual) => atual || lista[0]?.id || "");
      })
      .catch((e: Error) => setFalha(e.message));
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !categoriaId) return;
    setCriando(true);
    try {
      const { id } = await apiProjetos.criar(nome.trim(), categoriaId);
      const lista = await apiProjetos.listar();
      setProjetos(lista);
      setNome("");
      const criado = lista.find((p) => p.id === id);
      if (criado) aoEscolher(criado);
    } catch (err) {
      setFalha((err as Error).message);
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="tela-auth">
      <div className="cartao cartao-larga">
        <div className="topo-seletor">
          <h1>projetos</h1>
          <span>{usuario.nome}</span>
          <button type="button" onClick={aoSairDaConta}>
            sair
          </button>
        </div>

        {!projetos ? (
          <p>carregando…</p>
        ) : projetos.length === 0 ? (
          <p className="vazio">nenhum projeto ainda.</p>
        ) : (
          <ul className="lista-projetos">
            {projetos.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => aoEscolher(p)}>
                  {p.nome} <span className="papel">{p.papel}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {falha ? <p className="erro">{falha}</p> : null}

        {categorias.length > 0 ? (
          <form className="novo-projeto" onSubmit={(e) => void criar(e)}>
            <label htmlFor="novo-nome">novo projeto</label>
            <input
              id="novo-nome"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="nome"
            />
            {categorias.length > 1 ? (
              <>
                {/* O projeto enxerga TODAS as categorias; esta escolhe só qual é a principal
                    — a que abre a barra lateral e vence a fusão dos estilos de seta. */}
                <label htmlFor="categoria-principal">categoria principal</label>
                <select
                  id="categoria-principal"
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                >
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <button type="submit" disabled={criando}>
              criar
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
