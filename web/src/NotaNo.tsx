import { memo, useEffect, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";

export const NOTA_LARGURA = 176;

export type DadosNota = {
  conteudo: string;
  somenteLeitura: boolean;
  /** Grava no servidor. O canvas passa o `id` amarrado. */
  aoSalvar: (conteudo: string) => void;
};

/**
 * Post-it: nó do React Flow sem handle nenhum — nota não se conecta a nada, é anotação
 * livre sobre o canvas. Sem `Handle`, o React Flow não deixa puxar aresta dela.
 */
function Componente({ data, selected, width, height }: NodeProps) {
  const { conteudo, somenteLeitura, aoSalvar } = data as DadosNota;
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(conteudo);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editando) setRascunho(conteudo);
  }, [conteudo, editando]);

  useEffect(() => {
    if (editando) campo.current?.focus();
  }, [editando]);

  function fechar() {
    setEditando(false);
    if (rascunho !== conteudo) aoSalvar(rascunho);
  }

  return (
    <div
      className={`nota${selected ? " selecionada" : ""}`}
      style={{ width: width ?? NOTA_LARGURA, minHeight: height }}
      onDoubleClick={() => {
        if (!somenteLeitura) setEditando(true);
      }}
    >
      <NodeResizer isVisible={Boolean(selected && !somenteLeitura)} minWidth={20} minHeight={20} color="#facc15" />
      {editando ? (
        <textarea
          ref={campo}
          // nodrag/nowheel: sem isso o React Flow rouba o arraste de seleção de texto e a
          // rolagem dentro do campo.
          className="nodrag nowheel"
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={fechar}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setRascunho(conteudo);
              setEditando(false);
            }
          }}
        />
      ) : (
        <div className="nota-texto">
          {conteudo.trim() || <span className="vazio">{somenteLeitura ? "vazia" : "duplo-clique"}</span>}
        </div>
      )}
    </div>
  );
}

export const NotaNo = memo(Componente);
