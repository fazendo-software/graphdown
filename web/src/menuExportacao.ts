export type EscopoMenuExportacao = "projeto" | "selecao-area";
export type FormatoExportacao = "png" | "pdf" | "md" | "md-rfc";
export type ContagensExportacao = { nos: number; notas: number; setas: number; arestas: number };

export function nomeArquivoExportacao(
  projeto: string,
  escopo: EscopoMenuExportacao,
  formato: FormatoExportacao,
  agora = new Date(),
): string {
  const seguro = projeto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase() || "projeto";
  const parte = (n: number) => String(n).padStart(2, "0");
  const instante = `${agora.getFullYear()}${parte(agora.getMonth() + 1)}${parte(agora.getDate())}-${parte(agora.getHours())}${parte(agora.getMinutes())}`;
  const extensao = formato === "png" ? "png" : formato === "pdf" ? "pdf" : "md";
  return `${seguro}-${escopo === "projeto" ? "projeto" : "recorte"}-${instante}.${extensao}`;
}

export function textoDoRecorte(escopo: EscopoMenuExportacao, haSelecao: boolean): string {
  if (escopo === "projeto") return "projeto inteiro";
  return haSelecao ? "seleção atual" : "área atualmente visível";
}

export function resumoContagens({ nos, notas, setas, arestas }: ContagensExportacao): string {
  const objetos = nos + setas;
  return `${objetos} ${objetos === 1 ? "objeto" : "objetos"}, ${notas} ${notas === 1 ? "nota" : "notas"} e ${arestas} ${arestas === 1 ? "relação" : "relações"}`;
}

/** Erros de conectividade do browser não são informação acionável para quem exporta. */
export function mensagemErroExportacao(erro: unknown): string {
  const mensagem = erro instanceof Error ? erro.message : "";
  if (erro instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed/i.test(mensagem)) {
    return "Não foi possível conectar para obter o projeto. Verifique sua conexão e tente novamente.";
  }
  if (/^HTTP\s+\d{3}$/i.test(mensagem)) return "O projeto não respondeu à exportação. Tente novamente em instantes.";
  return mensagem || "Não foi possível preparar a exportação. Tente novamente.";
}
