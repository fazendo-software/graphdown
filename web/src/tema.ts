import { createContext, useContext } from "react";

export type Tema = "claro" | "escuro";
export type Preferencia = Tema | "sistema";

/**
 * Cores que o rough.js recebe como string, não como CSS: o desenho é gerado em JS e
 * `currentColor` não chega lá. O resto da interface usa as variáveis do estilo.css.
 */
export const PALETA: Record<Tema, Record<string, string>> = {
  claro: {
    texto: "#18181b",
    traco: "#3f3f46",
    aresta: "#52525b",
    rotuloFundo: "#ffffff",
    rotuloTexto: "#52525b",
    // Estados de execução: mesma família das variáveis do estilo.css, mas em hex porque
    // também vão para o rough e para o `stroke` inline da camada de fluxo.
    execEmAndamento: "#2563eb",
    execConcluido: "#16a34a",
    execBloqueado: "#dc2626",
    // Alfa em hex, concatenado na cor do nó: preenchimento discreto atrás do texto.
    alfa: "18",
  },
  escuro: {
    texto: "#e4e4e7",
    traco: "#a1a1aa",
    aresta: "#a1a1aa",
    rotuloFundo: "#232327",
    rotuloTexto: "#d4d4d8",
    execEmAndamento: "#60a5fa",
    execConcluido: "#4ade80",
    execBloqueado: "#f87171",
    alfa: "33",
  },
};

const Ctx = createContext<Tema>("claro");

export const TemaProvider = Ctx.Provider;

export function useTema(): Tema {
  return useContext(Ctx);
}

export function useCores(): Record<string, string> {
  return PALETA[useContext(Ctx)];
}

const CHAVE = "grapydown-tema";

export function lerPreferencia(): Preferencia {
  const salvo = typeof localStorage !== "undefined" ? localStorage.getItem(CHAVE) : null;
  return salvo === "claro" || salvo === "escuro" || salvo === "sistema" ? salvo : "sistema";
}

export function gravarPreferencia(p: Preferencia): void {
  try {
    localStorage.setItem(CHAVE, p);
  } catch {
    // modo privativo bloqueia o storage; a preferência só não sobrevive ao reload
  }
}
