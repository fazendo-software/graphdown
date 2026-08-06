import { useEffect, useState } from "react";
import type { Projeto, Usuario } from "../../core/tipos.ts";
import { apiAuth } from "./api.ts";
import { Login } from "./Login.tsx";
import { SeletorProjetos } from "./SeletorProjetos.tsx";
import { Canvas } from "./Canvas.tsx";

export function App() {
  // undefined = verificando sessão ainda; null = deslogado.
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [projeto, setProjeto] = useState<Projeto | null>(null);

  useEffect(() => {
    apiAuth
      .eu()
      .then(setUsuario)
      .catch(() => setUsuario(null));
  }, []);

  async function sairDaConta() {
    await apiAuth.sair().catch(() => {});
    setProjeto(null);
    setUsuario(null);
  }

  if (usuario === undefined) {
    return (
      <div className="tela-auth">
        <p>carregando…</p>
      </div>
    );
  }
  if (usuario === null) return <Login aoEntrar={setUsuario} />;
  if (!projeto) {
    return (
      <SeletorProjetos usuario={usuario} aoEscolher={setProjeto} aoSairDaConta={() => void sairDaConta()} />
    );
  }
  return (
    <Canvas
      projetoId={projeto.id}
      papel={projeto.papel}
      usuario={usuario}
      aoTrocarProjeto={setProjeto}
      aoVoltar={() => setProjeto(null)}
      aoSairDaConta={() => void sairDaConta()}
    />
  );
}
