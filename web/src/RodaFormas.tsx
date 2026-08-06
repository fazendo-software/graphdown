import { memo, useEffect, useMemo, useState } from "react";
import { desenharForma } from "./rough.ts";
import { useCores } from "./tema.ts";

import { ANGULOS_OBJETO, anguloCategoria, RAIO_CATEGORIA, RAIO_OBJETO } from "./rodaGeometria.ts";

const MINI = { largura: 40, altura: 28 };

function Miniatura({ forma }: { forma: string }) {
  const cores = useCores();
  const tracos = useMemo(
    () =>
      desenharForma(
        forma,
        { seed: 7, roughness: 1.1, bowing: 0.9, stroke: cores.traco, strokeWidth: 1.4 },
        MINI,
      ),
    [forma, cores.traco],
  );
  return (
    <svg width={MINI.largura} height={MINI.altura} aria-hidden="true">
      {tracos.map((t, i) => (
        <path key={i} d={t.d} stroke={t.stroke} fill={t.fill} strokeWidth={t.strokeWidth} />
      ))}
    </svg>
  );
}

export type CategoriaRoda = {
  id: string;
  nome: string;
  tipos: string[];
  formaDoTipo: (tipo: string) => string;
};

type Props = {
  x: number;
  y: number;
  categorias: CategoriaRoda[];
  /** `segurar`: abriu com o botão esquerdo pressionado, soltar sobre um objeto escolhe.
   * `clique`: abriu pelo menu de contexto e fica de pé até clicarem. */
  gesto: "segurar" | "clique";
  aoEscolher: (categoriaId: string, tipo: string) => void;
  aoFechar: () => void;
};

function posicao(ang: number, raio: number) {
  return `translate(-50%, -50%) translate(${Math.cos(ang) * raio}px, ${Math.sin(ang) * raio}px)`;
}

function Componente({ x, y, categorias, gesto, aoEscolher, aoFechar }: Props) {
  const [aberta, setAberta] = useState<string | null>(
    // Uma categoria só: não há o que escolher no anel interno, já abre os objetos dela.
    categorias.length === 1 ? categorias[0].id : null,
  );

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  useEffect(() => {
    // No gesto de segurar, soltar em qualquer lugar encerra. O `pointerup` do próprio item
    // roda antes deste (borbulha), então escolher continua funcionando.
    if (gesto !== "segurar") return;
    const soltou = () => aoFechar();
    window.addEventListener("pointerup", soltou);
    return () => window.removeEventListener("pointerup", soltou);
  }, [gesto, aoFechar]);

  const indiceAberta = categorias.findIndex((c) => c.id === aberta);
  const categoriaAberta = indiceAberta >= 0 ? categorias[indiceAberta] : undefined;
  const angCategoria = (i: number) => anguloCategoria(i, categorias.length);

  return (
    // Fundo transparente cobrindo a tela: qualquer clique fora fecha sem criar nada.
    <div className="roda-fundo" onClick={aoFechar} onContextMenu={(e) => e.preventDefault()}>
      <div className="roda" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
        <span className="roda-centro" aria-hidden="true" />

        {categorias.map((cat, i) => (
          <button
            key={cat.id}
            type="button"
            className="roda-cat"
            aria-pressed={cat.id === aberta}
            style={{ transform: posicao(angCategoria(i), RAIO_CATEGORIA) }}
            // Hover abre: no gesto de segurar não há clique intermediário para dar, e no
            // gesto de clique passar o mouse é o mesmo que o usuário já esperaria.
            onPointerEnter={() => setAberta(cat.id)}
            onFocus={() => setAberta(cat.id)}
          >
            {cat.nome}
          </button>
        ))}

        {categoriaAberta
          ? (() => {
              const angulos = ANGULOS_OBJETO(
                categoriaAberta.tipos.length,
                angCategoria(indiceAberta),
              );
              return categoriaAberta.tipos.map((tipo, j) => (
                <button
                  key={tipo}
                  type="button"
                  className="roda-item"
                  style={{ transform: posicao(angulos[j], RAIO_OBJETO) }}
                  // `pointerup` e não `click`: serve para soltar depois de segurar E para o
                  // clique comum, sem dois caminhos separados.
                  onPointerUp={() => aoEscolher(categoriaAberta.id, tipo)}
                >
                  <Miniatura forma={categoriaAberta.formaDoTipo(tipo)} />
                  <span>{tipo}</span>
                </button>
              ));
            })()
          : null}
      </div>
    </div>
  );
}

export const RodaFormas = memo(Componente);
