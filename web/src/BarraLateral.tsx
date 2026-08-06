import { useEffect, useState } from "react";
import type { Nota, ResultadoBusca } from "../../core/tipos.ts";
import { PaletaFormas } from "./PaletaFormas.tsx";
import { PaletaSetas } from "./PaletaSetas.tsx";
import { formaDoTipo, tiposDeForma, type Catalogo } from "./grafoRender.ts";

/** Item do outline: um nó do grafo já reduzido ao que a lista precisa. */
export type ItemGrafo = { id: string; titulo: string; tipo: string; categoria: string };

/** Objeto armado na paleta: qual categoria cria e qual tipo dentro dela. `nota` é o caso
 * especial que não pertence a categoria nenhuma. */
export type Armado = { categoriaId: string; tipo: string } | { categoriaId: null; tipo: "nota" };

type Props = {
  catalogo: Catalogo | null;
  somenteLeitura: boolean;
  itens: ItemGrafo[];
  notas: Nota[];
  armado: Armado | null;
  setaArmada: string | null;
  aoArmar: (a: Armado) => void;
  aoArmarSeta: (tipo: string) => void;
  aoBuscar: (q: string) => Promise<ResultadoBusca[]>;
  aoIrPara: (id: string) => void;
  aoAbrirNo: (id: string) => void;
};

function Secao({
  titulo,
  contagem,
  children,
}: {
  titulo: string;
  contagem?: number;
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(true);
  return (
    <section className="secao">
      <button type="button" className="secao-topo" aria-expanded={aberta} onClick={() => setAberta((a) => !a)}>
        <span className="seta">{aberta ? "▾" : "▸"}</span>
        <span>{titulo}</span>
        {contagem === undefined ? null : <span className="contagem">{contagem}</span>}
      </button>
      {aberta ? children : null}
    </section>
  );
}

export function BarraLateral({
  catalogo,
  somenteLeitura,
  itens,
  notas,
  armado,
  setaArmada,
  aoArmar,
  aoArmarSeta,
  aoBuscar,
  aoIrPara,
  aoAbrirNo,
}: Props) {
  const [q, setQ] = useState("");
  const [achados, setAchados] = useState<ResultadoBusca[] | null>(null);

  // Debounce: o campo dispara a cada tecla e a busca vai ao servidor. `cancelado` evita
  // que uma resposta lenta de um termo antigo sobrescreva a de um termo novo.
  useEffect(() => {
    if (!q.trim()) {
      setAchados(null);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(() => {
      aoBuscar(q)
        .then((r) => !cancelado && setAchados(r))
        .catch(() => !cancelado && setAchados([]));
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [q, aoBuscar]);

  // Outline agrupado por categoria e, dentro dela, por tipo — mesma hierarquia da paleta.
  const porCategoria = new Map<string, Map<string, ItemGrafo[]>>();
  for (const item of itens) {
    let tipos = porCategoria.get(item.categoria);
    if (!tipos) porCategoria.set(item.categoria, (tipos = new Map()));
    const lista = tipos.get(item.tipo);
    if (lista) lista.push(item);
    else tipos.set(item.tipo, [item]);
  }

  return (
    <aside className="lateral" aria-label="painel do projeto">
      <input
        className="campo-busca"
        type="search"
        value={q}
        placeholder="buscar no projeto…"
        aria-label="buscar no projeto"
        onChange={(e) => setQ(e.target.value)}
      />

      {achados ? (
        <Secao titulo="resultados" contagem={achados.length}>
          {achados.length === 0 ? (
            <p className="vazio">nada encontrado.</p>
          ) : (
            <ul className="lista">
              {achados.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => aoAbrirNo(a.id)}>
                    <strong>{a.titulo}</strong>
                    {/* texto puro de propósito: `ts_headline` não escapa o corpo, então marca
                        o que casou com «» em vez de <b> (ver servidor/nos.ts). */}
                    <span className="trecho">{a.trecho}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      ) : null}

      {catalogo && !somenteLeitura ? (
        <>
          {/* Uma seção de objetos por categoria do projeto, na ordem que o servidor mandou
              (principal primeiro). */}
          {catalogo.categorias.map((cat) => (
            <Secao key={cat.id} titulo={cat.nome}>
              <PaletaFormas
                tipos={tiposDeForma(cat)}
                formaDoTipo={(t) => formaDoTipo(cat, t)}
                armado={armado?.categoriaId === cat.id ? armado.tipo : null}
                aoArmar={(tipo) => aoArmar({ categoriaId: cat.id, tipo })}
              />
            </Secao>
          ))}

          <Secao titulo="setas">
            <PaletaSetas estilos={catalogo.arestasEstilo} armada={setaArmada} aoArmar={aoArmarSeta} />
          </Secao>

          <Secao titulo="anotação">
            <button
              type="button"
              className="paleta-item nota-item"
              aria-pressed={armado?.tipo === "nota"}
              title="nota: arraste para o canvas, ou clique e depois clique onde quiser"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/grapydown-tipo", "nota");
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => aoArmar({ categoriaId: null, tipo: "nota" })}
            >
              <span className="mini-nota" aria-hidden="true" />
              <span>nota</span>
            </button>
          </Secao>
        </>
      ) : null}

      <Secao titulo="grafo" contagem={itens.length}>
        {itens.length === 0 ? (
          <p className="vazio">nenhum objeto ainda.</p>
        ) : (
          [...porCategoria].map(([categoria, tipos]) => (
            <div key={categoria} className="grupo">
              <h3>
                {categoria || "sem categoria"}
                <span className="contagem">{[...tipos.values()].reduce((n, l) => n + l.length, 0)}</span>
              </h3>
              {[...tipos].map(([tipo, lista]) => (
                <div key={tipo} className="subgrupo">
                  <h4>
                    {tipo || "sem tipo"} <span className="contagem">{lista.length}</span>
                  </h4>
                  <ul className="lista">
                    {lista.map((n) => (
                      <li key={n.id}>
                        <button type="button" onClick={() => aoIrPara(n.id)}>
                          {n.titulo}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))
        )}
      </Secao>

      <Secao titulo="notas" contagem={notas.length}>
        {notas.length === 0 ? (
          <p className="vazio">nenhuma nota.</p>
        ) : (
          <ul className="lista">
            {notas.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => aoIrPara(n.id)}>
                  🗒 {n.conteudo.trim().split("\n")[0] || "(vazia)"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </aside>
  );
}
