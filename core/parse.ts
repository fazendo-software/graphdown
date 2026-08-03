import { parseDocument, Document } from "yaml";

const DELIM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type Nota = { doc: Document; corpo: string; erro?: string };

export function parseNota(texto: string): Nota {
  const m = texto.match(DELIM);
  if (!m) return { doc: parseDocument(""), corpo: texto };
  const doc = parseDocument(m[1]);
  const erro = doc.errors.length > 0 ? doc.errors[0].message : undefined;
  return { doc, corpo: texto.slice(m[0].length), erro };
}

export function serializarNota(doc: Document, corpo: string): string {
  // lineWidth: 0 desliga a quebra automatica em 80 colunas. Sem isso, editar um campo
  // requebra linhas longas de OUTROS campos e o diff acusa alteracao que nao houve.
  return `---\n${doc.toString({ lineWidth: 0 }).trimEnd()}\n---\n${corpo}`;
}

export function editarCampo(texto: string, chave: string, valor: unknown): string {
  const { doc, corpo, erro } = parseNota(texto);
  // ponytail: nao editamos nota com YAML quebrado — reserializar destruiria o que o
  // usuario escreveu. A UI mostra o erro e pede correcao no editor de texto.
  if (erro) throw new Error(`frontmatter inválido: ${erro}`);
  doc.set(chave, valor);
  const saida = serializarNota(doc, corpo);
  // O serializador do `yaml` so emite LF. Arquivo escrito no Windows viraria EOL misto
  // (frontmatter LF, corpo CRLF) e o diff acusaria todas as linhas do frontmatter.
  return texto.includes("\r\n") ? saida.replace(/(?<!\r)\n/g, "\r\n") : saida;
}

export function editarCorpo(texto: string, corpo: string): string {
  // Splice de string, nao round-trip: o frontmatter sai byte a byte igual entrou.
  const m = texto.match(DELIM);
  return m ? m[0] + corpo : corpo;
}
