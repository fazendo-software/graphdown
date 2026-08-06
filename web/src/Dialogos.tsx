import { useEffect, useRef } from "react";

type ConfirmacaoProps = {
  mensagem: string;
  confirmar: string;
  aoConfirmar: () => void;
  aoCancelar: () => void;
};

export function DialogoConfirmacao({ mensagem, confirmar, aoConfirmar, aoCancelar }: ConfirmacaoProps) {
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => botao.current?.focus(), []);
  return (
    <div className="modal-fundo" onClick={aoCancelar} role="presentation">
      <div className="modal dialogo" role="dialog" aria-modal="true" aria-label="confirmação" onClick={(e) => e.stopPropagation()}>
        <button className="modal-fechar" type="button" aria-label="fechar" title="fechar" onClick={aoCancelar}>×</button>
        <h2>confirmar ação</h2>
        <p>{mensagem}</p>
        <div className="modal-acoes">
          <button type="button" onClick={aoCancelar}>cancelar</button>
          <button ref={botao} type="button" className="perigo" onClick={aoConfirmar}>{confirmar}</button>
        </div>
      </div>
    </div>
  );
}

type TextoProps = {
  mensagem: string;
  valor: string;
  confirmar: string;
  aoConfirmar: (valor: string) => void;
  aoCancelar: () => void;
};

export function DialogoTexto({ mensagem, valor, confirmar, aoConfirmar, aoCancelar }: TextoProps) {
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);
  return (
    <div className="modal-fundo" onClick={aoCancelar} role="presentation">
      <div className="modal dialogo" role="dialog" aria-modal="true" aria-label={mensagem} onClick={(e) => e.stopPropagation()}>
        <button className="modal-fechar" type="button" aria-label="fechar" title="fechar" onClick={aoCancelar}>×</button>
        <h2>novo objeto</h2>
        <label htmlFor="dialogo-texto">{mensagem}</label>
        <input
          ref={campo}
          id="dialogo-texto"
          defaultValue={valor}
          onKeyDown={(e) => {
            if (e.key === "Enter") aoConfirmar(e.currentTarget.value);
            if (e.key === "Escape") aoCancelar();
          }}
        />
        <div className="modal-acoes">
          <button type="button" onClick={aoCancelar}>cancelar</button>
          <button type="button" onClick={() => aoConfirmar(campo.current?.value ?? "")}>{confirmar}</button>
        </div>
      </div>
    </div>
  );
}
