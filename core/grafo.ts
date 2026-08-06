export type ArestaCrua = {
  de: string;
  quando?: string;
  tipo?: string;
  campos: Record<string, unknown>;
};

// Preservado para o importador de .md legado (fora desta entrega, ver contrato §"Fora
// desta entrega") — o caminho de escrita normal agora é estruturado (jsonb), não passa
// mais por aqui.
export function normalizarAresta(entrada: unknown): ArestaCrua | null {
  if (typeof entrada === "string") {
    return { de: entrada, quando: undefined, tipo: undefined, campos: {} };
  }
  if (entrada !== null && typeof entrada === "object") {
    // `de`, `quando` e `tipo` sao estruturais; o resto e recurso da transicao e passa
    // adiante sem o core saber o nome — quem declara isso e a categoria.
    const { de, quando, tipo, ...resto } = entrada as Record<string, unknown>;
    if (typeof de === "string") {
      return {
        de,
        quando: typeof quando === "string" ? quando : undefined,
        tipo: typeof tipo === "string" ? tipo : undefined,
        campos: resto,
      };
    }
  }
  return null;
}

/** `depende_de: 01-a` (escalar) vale tanto quanto uma lista de um item. */
export function comoLista(valor: unknown): unknown[] {
  if (Array.isArray(valor)) return valor;
  return valor === undefined || valor === null ? [] : [valor];
}
