import { test } from "node:test";
import assert from "node:assert/strict";
import { criarPool } from "./db.ts";
import { clienteCookies, criarProjetoDeTeste, registrar, subirServidor } from "./testeApoio.ts";

test("registrar cria usuário, autentica por cookie e /eu devolve quem é", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente, email } = await registrar(base);
    const eu = await (await cliente.get("/api/auth/eu")).json();
    assert.equal(eu.usuario.email, email);
  } finally {
    await fechar();
  }
});

test("/eu sem cookie dá 401", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const r = await clienteCookies(base).get("/api/auth/eu");
    assert.equal(r.status, 401);
  } finally {
    await fechar();
  }
});

test("registrar com email repetido dá 409", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const cliente = clienteCookies(base);
    const email = `dup-${Date.now()}@exemplo.com`;
    await cliente.post("/api/auth/registrar", { email, nome: "A", senha: "senha1234" });
    const r = await cliente.post("/api/auth/registrar", { email, nome: "B", senha: "senha1234" });
    assert.equal(r.status, 409);
  } finally {
    await fechar();
  }
});

test("entrar com senha errada dá 401 e não revela qual campo errou", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const cliente = clienteCookies(base);
    const email = `login-${Date.now()}@exemplo.com`;
    await cliente.post("/api/auth/registrar", { email, nome: "A", senha: "senha1234" });
    const r = await clienteCookies(base).post("/api/auth/entrar", { email, senha: "errada123" });
    assert.equal(r.status, 401);
    const { erro } = await r.json();
    assert.equal(erro, "credenciais inválidas");
  } finally {
    await fechar();
  }
});

test("sair apaga a sessão — /eu depois dá 401", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    await cliente.post("/api/auth/sair");
    const r = await cliente.get("/api/auth/eu");
    assert.equal(r.status, 401);
  } finally {
    await fechar();
  }
});

test("GET /api/categorias lista a categoria semeada", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const categorias = await (await cliente.get("/api/categorias")).json();
    assert.ok(categorias.some((c: { nome: string }) => c.nome === "Processo"));
  } finally {
    await fechar();
  }
});

test("projeto: quem não é membro recebe 404, não 403", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const dono = await registrar(base);
    const projetoId = await criarProjetoDeTeste(dono.cliente);

    const outro = await registrar(base);
    const r = await outro.cliente.get(`/api/projetos/${projetoId}/grafo`);
    assert.equal(r.status, 404);
  } finally {
    await fechar();
  }
});

test("POST /projetos cria membership dono; GET /projetos lista com o papel", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const projetos = await (await cliente.get("/api/projetos")).json();
    const meu = projetos.find((p: { id: string }) => p.id === projetoId);
    assert.equal(meu.papel, "dono");
  } finally {
    await fechar();
  }
});

test("GET /grafo devolve titulo, as categorias do projeto e listas vazias num projeto novo", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const g = await (await cliente.get(`/api/projetos/${projetoId}/grafo`)).json();
    assert.equal(g.titulo, "Projeto de teste");
    // Projeto novo enxerga todas as categorias semeadas, com a escolhida em primeiro.
    assert.equal(g.categorias[0].nome, "Processo");
    assert.deepEqual(
      g.categorias.map((c: { nome: string }) => c.nome).sort(),
      ["Atores", "Dados", "Infraestrutura", "Processo", "Riscos e Controles"],
    );
    assert.ok(g.categorias.every((c: { id?: string }) => c.id), "cada categoria traz seu id");
    // Estilos de seta e recursos são fundidos e valem para o projeto inteiro.
    assert.equal(g.arestasEstilo.excecao.grupo, "condicional");
    assert.ok(g.camposAresta.some((c: { chave: string }) => c.chave === "prazo"));
    assert.deepEqual(g.nos, []);
    assert.deepEqual(g.arestas, []);
    assert.deepEqual(g.fantasmas, []);
    assert.deepEqual(g.layout, {});
  } finally {
    await fechar();
  }
});

test("POST /nos cria com id derivado do título e campos padrão da categoria", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const r = await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Aprovação do gestor" });
    assert.equal(r.status, 201);
    const { id } = await r.json();
    assert.equal(id, "aprovacao-do-gestor");
    const no = await (await cliente.get(`/api/projetos/${projetoId}/nos/${id}`)).json();
    assert.equal(no.campos.status, "rascunho");
    assert.equal(no.corpo, "");
    assert.equal(no.versao, 1);
  } finally {
    await fechar();
  }
});

test("nó sem responsável não recebe erro de categoria", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const r = await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Sem responsável" });
    const { id } = await r.json();
    const no = await (await cliente.get(`/api/projetos/${projetoId}/nos/${id}`)).json();
    assert.equal(no.erro, undefined);
  } finally {
    await fechar();
  }
});

test("PUT corpo com versão certa grava e incrementa; versão errada dá 409 com o corpo atual", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const { id } = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Nó" })).json();

    const ok = await cliente.put(`/api/projetos/${projetoId}/nos/${id}/corpo`, { corpo: "primeiro", versao: 1 });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, versao: 2 });

    const conflito = await cliente.put(`/api/projetos/${projetoId}/nos/${id}/corpo`, { corpo: "outro", versao: 1 });
    assert.equal(conflito.status, 409);
    const corpoConflito = await conflito.json();
    assert.equal(corpoConflito.versao, 2);
    assert.equal(corpoConflito.corpo, "primeiro");
  } finally {
    await fechar();
  }
});

test("PATCH campos funde com o que já existe, sem apagar os outros campos", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const { id } = await (
      await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Nó", campos: { responsavel: "rh" } })
    ).json();
    await cliente.patch(`/api/projetos/${projetoId}/nos/${id}`, { campos: { status: "ativo" } });
    const no = await (await cliente.get(`/api/projetos/${projetoId}/nos/${id}`)).json();
    assert.equal(no.campos.responsavel, "rh");
    assert.equal(no.campos.status, "ativo");
  } finally {
    await fechar();
  }
});

test("POST /arestas liga dois nós; religar o mesmo par dá 409", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const a = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "A" })).json();
    const b = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "B" })).json();

    const r1 = await cliente.post(`/api/projetos/${projetoId}/arestas`, { de: a.id, para: b.id });
    assert.equal(r1.status, 201);
    const r2 = await cliente.post(`/api/projetos/${projetoId}/arestas`, { de: a.id, para: b.id });
    assert.equal(r2.status, 409);
  } finally {
    await fechar();
  }
});

test("POST /arestas com destino inexistente dá 404, não 500", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const origem = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Origem" })).json();
    const r = await cliente.post(`/api/projetos/${projetoId}/arestas`, { de: origem.id, para: "nao-existe" });
    assert.equal(r.status, 404);
  } finally {
    await fechar();
  }
});

test("PATCH e DELETE de aresta recusam id que não é UUID", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const patch = await cliente.patch(`/api/projetos/${projetoId}/arestas/invalido`, { quando: "x" });
    const apagar = await cliente.delete(`/api/projetos/${projetoId}/arestas/invalido`);
    assert.equal(patch.status, 404);
    assert.equal(apagar.status, 404);
  } finally {
    await fechar();
  }
});

test("PATCH /arestas distingue campo omitido de campo limpo", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const a = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "A" })).json();
    const b = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "B" })).json();
    const { id } = await (await cliente.post(`/api/projetos/${projetoId}/arestas`, { de: a.id, para: b.id })).json();

    await cliente.patch(`/api/projetos/${projetoId}/arestas/${id}`, { quando: "aprovado", tipo: "excecao" });
    await cliente.patch(`/api/projetos/${projetoId}/arestas/${id}`, { quando: null, tipo: null });

    const grafo = await (await cliente.get(`/api/projetos/${projetoId}/grafo`)).json();
    const aresta = grafo.arestas.find((item: { id: string }) => item.id === id);
    assert.equal(aresta.quando, undefined);
    assert.equal(aresta.tipo, undefined);
  } finally {
    await fechar();
  }
});

test("fantasma: aresta apontando pra id inexistente aparece em fantasmas, some quando o nó é criado", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const b = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "B" })).json();
    await cliente.post(`/api/projetos/${projetoId}/arestas`, { de: "sumiu", para: b.id });

    const g1 = await (await cliente.get(`/api/projetos/${projetoId}/grafo`)).json();
    assert.deepEqual(g1.fantasmas, ["sumiu"]);

    await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Sumiu", campos: {} });
    // id derivado de "Sumiu" é "sumiu" — mesmo slug, preenche o fantasma.
    const g2 = await (await cliente.get(`/api/projetos/${projetoId}/grafo`)).json();
    assert.deepEqual(g2.fantasmas, []);
  } finally {
    await fechar();
  }
});

test("soft delete: apagar nó apaga as arestas em que ele é origem — não vira fantasma", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const a = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "A" })).json();
    const b = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "B" })).json();
    await cliente.post(`/api/projetos/${projetoId}/arestas`, { de: a.id, para: b.id });

    const del = await cliente.delete(`/api/projetos/${projetoId}/nos/${a.id}`);
    assert.equal(del.status, 200);

    const g = await (await cliente.get(`/api/projetos/${projetoId}/grafo`)).json();
    assert.equal(g.nos.some((n: { id: string }) => n.id === a.id), false);
    assert.deepEqual(g.arestas, []);
    // se a aresta não tivesse sido apagada junto, "a" reapareceria aqui como fantasma vermelho.
    assert.deepEqual(g.fantasmas, []);
  } finally {
    await fechar();
  }
});

test("soft delete: religar o mesmo par depois de apagar a aresta funciona (índice parcial)", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const a = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "A" })).json();
    const b = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "B" })).json();

    const { id: arestaId } = await (
      await cliente.post(`/api/projetos/${projetoId}/arestas`, { de: a.id, para: b.id })
    ).json();
    const del = await cliente.delete(`/api/projetos/${projetoId}/arestas/${arestaId}`);
    assert.equal(del.status, 200);

    const religa = await cliente.post(`/api/projetos/${projetoId}/arestas`, { de: a.id, para: b.id });
    assert.equal(religa.status, 201);

    const g = await (await cliente.get(`/api/projetos/${projetoId}/grafo`)).json();
    assert.equal(g.arestas.length, 1);
  } finally {
    await fechar();
  }
});

test("soft delete: id não é liberado — recriar título repetido depois de apagar dá sufixo -2", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const primeiro = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Repetido" })).json();
    await cliente.delete(`/api/projetos/${projetoId}/nos/${primeiro.id}`);
    const segundo = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Repetido" })).json();
    assert.equal(primeiro.id, "repetido");
    assert.equal(segundo.id, "repetido-2");
  } finally {
    await fechar();
  }
});

test("POST com título repetido (sem apagar) não colide", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const a = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Repetido" })).json();
    const b = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Repetido" })).json();
    assert.notEqual(a.id, b.id);
  } finally {
    await fechar();
  }
});

test("leitor não escreve: PATCH de campo dá 403", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const dono = await registrar(base);
    const projetoId = await criarProjetoDeTeste(dono.cliente);
    const { id } = await (await dono.cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Nó" })).json();

    // sem rota de convite nesta entrega (ver relatório) — membership de leitor inserida
    // direto no banco pra exercitar a checagem de papel.
    const leitor = await registrar(base);
    const pool = criarPool();
    await pool.query("insert into projeto_membros (projeto_id, usuario_id, papel) values ($1, $2, 'leitor')", [
      projetoId,
      leitor.usuarioId,
    ]);
    await pool.end();

    const r = await leitor.cliente.patch(`/api/projetos/${projetoId}/nos/${id}`, { campos: { status: "ativo" } });
    assert.equal(r.status, 403);
  } finally {
    await fechar();
  }
});

test("DELETE projeto só o dono pode", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const dono = await registrar(base);
    const projetoId = await criarProjetoDeTeste(dono.cliente);

    const outro = await registrar(base);
    const pool = criarPool();
    await pool.query("insert into projeto_membros (projeto_id, usuario_id, papel) values ($1, $2, 'editor')", [
      projetoId,
      outro.usuarioId,
    ]);
    await pool.end();

    const negado = await outro.cliente.delete(`/api/projetos/${projetoId}`);
    assert.equal(negado.status, 403);

    const ok = await dono.cliente.delete(`/api/projetos/${projetoId}`);
    assert.equal(ok.status, 200);
  } finally {
    await fechar();
  }
});

test("Origin diferente do host é rejeitado numa rota mutante", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const r = await fetch(`${base}/api/projetos/${projetoId}/nos`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://site-malicioso.example" },
      body: JSON.stringify({ titulo: "X" }),
    });
    assert.equal(r.status, 403);
  } finally {
    await fechar();
  }
});

test("corpo JSON maior que o limite dá 413", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const grande = "x".repeat(1_100_000);
    const r = await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: grande });
    assert.equal(r.status, 413);
  } finally {
    await fechar();
  }
});

test("rota inexistente sob /api dá 404", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const r = await cliente.get("/api/nada");
    assert.equal(r.status, 404);
  } finally {
    await fechar();
  }
});

test("busca acha por título, por corpo e por campo; nó apagado não aparece", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const p = await criarProjetoDeTeste(cliente);
    const busca = async (q: string) =>
      (await (await cliente.get(`/api/projetos/${p}/busca?q=${encodeURIComponent(q)}`)).json()) as {
        id: string;
      }[];

    const { id: aprovar } = await (await cliente.post(`/api/projetos/${p}/nos`, { titulo: "Aprovar pedido" })).json();
    const { id: emitir } = await (await cliente.post(`/api/projetos/${p}/nos`, { titulo: "Emitir nota" })).json();
    const gravado = await cliente.put(`/api/projetos/${p}/nos/${emitir}/corpo`, {
      corpo: "conferir o contrato do fornecedor antes\n",
      versao: 1,
    });
    assert.equal(gravado.status, 200);
    await cliente.patch(`/api/projetos/${p}/nos/${aprovar}`, { campos: { responsavel: "Marcondes" } });

    assert.deepEqual((await busca("pedido")).map((n) => n.id), [aprovar]);
    assert.deepEqual((await busca("fornecedor")).map((n) => n.id), [emitir]); // corpo
    assert.deepEqual((await busca("Marcondes")).map((n) => n.id), [aprovar]); // campo
    assert.deepEqual((await busca("apro")).map((n) => n.id), [aprovar]); // prefixo, via ilike
    assert.equal((await busca("")).length, 0);

    await cliente.delete(`/api/projetos/${p}/nos/${aprovar}`);
    assert.equal((await busca("pedido")).length, 0);
  } finally {
    await fechar();
  }
});

test("busca com entrada solta não dá 500 e curinga digitado é literal", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const p = await criarProjetoDeTeste(cliente);
    await cliente.post(`/api/projetos/${p}/nos`, { titulo: "Aprovar pedido" });

    // to_tsquery quebraria nestes; websearch_to_tsquery não.
    for (const q of ["!!!", "a & ", "'", '"aspas soltas', "&|!"]) {
      const r = await cliente.get(`/api/projetos/${p}/busca?q=${encodeURIComponent(q)}`);
      assert.equal(r.status, 200, `q=${q} devia responder 200`);
    }
    // '%' sozinho não pode virar "casa com tudo".
    const curinga = (await (await cliente.get(`/api/projetos/${p}/busca?q=%25`)).json()) as unknown[];
    assert.equal(curinga.length, 0);
  } finally {
    await fechar();
  }
});

test("busca: não-membro recebe 404", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const dono = await registrar(base);
    const p = await criarProjetoDeTeste(dono.cliente);
    const estranho = await registrar(base);
    const r = await estranho.cliente.get(`/api/projetos/${p}/busca?q=x`);
    assert.equal(r.status, 404);
  } finally {
    await fechar();
  }
});

test("nota: cria, move, edita e apaga; GET /grafo devolve as notas", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const p = await criarProjetoDeTeste(cliente);

    const criada = await cliente.post(`/api/projetos/${p}/notas`, { conteudo: "conferir contrato", x: 10, y: 20 });
    assert.equal(criada.status, 201);
    const nota = (await criada.json()) as { id: string; conteudo: string; x: number; y: number };
    assert.deepEqual({ conteudo: nota.conteudo, x: nota.x, y: nota.y }, { conteudo: "conferir contrato", x: 10, y: 20 });

    const grafo = (await (await cliente.get(`/api/projetos/${p}/grafo`)).json()) as { notas: unknown[] };
    assert.equal(grafo.notas.length, 1);

    const movida = (await (
      await cliente.patch(`/api/projetos/${p}/notas/${nota.id}`, { x: 99, y: 77 })
    ).json()) as { x: number; y: number; conteudo: string };
    assert.deepEqual(movida, { id: nota.id, conteudo: "conferir contrato", x: 99, y: 77 });

    await cliente.delete(`/api/projetos/${p}/notas/${nota.id}`);
    const vazio = (await (await cliente.get(`/api/projetos/${p}/notas`)).json()) as unknown[];
    assert.equal(vazio.length, 0);
  } finally {
    await fechar();
  }
});

test("PATCH de nota distingue chave omitida de conteúdo limpo", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const p = await criarProjetoDeTeste(cliente);
    const { id } = (await (
      await cliente.post(`/api/projetos/${p}/notas`, { conteudo: "texto", x: 0, y: 0 })
    ).json()) as { id: string };

    // só posição: conteúdo preservado.
    const so = (await (await cliente.patch(`/api/projetos/${p}/notas/${id}`, { x: 5, y: 5 })).json()) as {
      conteudo: string;
    };
    assert.equal(so.conteudo, "texto");

    // null explícito: limpa. Era o bug do `coalesce` em atualizarAresta.
    const limpa = (await (
      await cliente.patch(`/api/projetos/${p}/notas/${id}`, { conteudo: null })
    ).json()) as { conteudo: string; x: number };
    assert.equal(limpa.conteudo, "");
    assert.equal(limpa.x, 5, "posição não podia ter sido tocada");
  } finally {
    await fechar();
  }
});

test("nota: leitor lê mas não escreve; id inválido dá 404, não 500", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const dono = await registrar(base);
    const p = await criarProjetoDeTeste(dono.cliente);
    await dono.cliente.post(`/api/projetos/${p}/notas`, { conteudo: "a", x: 0, y: 0 });

    const leitor = await registrar(base);
    const pool = criarPool();
    await pool.query("insert into projeto_membros (projeto_id, usuario_id, papel) values ($1, $2, 'leitor')", [
      p,
      leitor.usuarioId,
    ]);
    await pool.end();

    assert.equal((await leitor.cliente.get(`/api/projetos/${p}/notas`)).status, 200);
    assert.equal((await leitor.cliente.post(`/api/projetos/${p}/notas`, { x: 0, y: 0 })).status, 403);

    assert.equal((await dono.cliente.delete(`/api/projetos/${p}/notas/nao-e-uuid`)).status, 404);
    assert.equal(
      (await dono.cliente.patch(`/api/projetos/${p}/notas/00000000-0000-4000-8000-000000000000`, { x: 1, y: 1 }))
        .status,
      404,
    );
  } finally {
    await fechar();
  }
});

test("POST /nos com categoria_id de outra categoria do projeto usa os campos dela", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const p = await criarProjetoDeTeste(cliente);
    const g = (await (await cliente.get(`/api/projetos/${p}/grafo`)).json()) as {
      categorias: { id: string; nome: string }[];
    };
    const dados = g.categorias.find((c) => c.nome === "Dados")!;

    const r = await cliente.post(`/api/projetos/${p}/nos`, {
      titulo: "Contrato assinado",
      categoria_id: dados.id,
      campos: { tipo: "documento" },
    });
    assert.equal(r.status, 201);
    const { id } = (await r.json()) as { id: string };

    const no = (await (await cliente.get(`/api/projetos/${p}/nos/${id}`)).json()) as {
      categoria_id: string;
      campos: Record<string, string>;
      erro?: string;
    };
    assert.equal(no.categoria_id, dados.id, "o nó guarda a categoria com que foi criado");
    assert.equal(no.campos.tipo, "documento");
    // `formato` é campo de Dados e não existe em Processo: prova que camposPadrao usou a
    // categoria certa, não a principal do projeto.
    assert.equal(no.campos.formato, "");
    assert.equal(no.erro ?? null, null);
  } finally {
    await fechar();
  }
});

test("PATCH de campos valida contra a categoria DO NÓ, não a principal do projeto", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const p = await criarProjetoDeTeste(cliente);
    const g = (await (await cliente.get(`/api/projetos/${p}/grafo`)).json()) as {
      categorias: { id: string; nome: string }[];
    };
    const dados = g.categorias.find((c) => c.nome === "Dados")!;
    const { id } = (await (
      await cliente.post(`/api/projetos/${p}/nos`, { titulo: "Planilha", categoria_id: dados.id })
    ).json()) as { id: string };

    // "armazenamento" só existe em Dados. Se validasse contra Processo (a principal), isto
    // viraria "valor fora das opções".
    await cliente.patch(`/api/projetos/${p}/nos/${id}`, { campos: { tipo: "armazenamento" } });
    const ok = (await (await cliente.get(`/api/projetos/${p}/nos/${id}`)).json()) as { erro?: string };
    assert.equal(ok.erro ?? null, null);

    // E "passo", que é de Processo, tem de ser recusado neste nó.
    await cliente.patch(`/api/projetos/${p}/nos/${id}`, { campos: { tipo: "passo" } });
    const ruim = (await (await cliente.get(`/api/projetos/${p}/nos/${id}`)).json()) as { erro?: string };
    assert.match(ruim.erro ?? "", /fora das opções/);
  } finally {
    await fechar();
  }
});

test("POST /nos recusa categoria que não pertence ao projeto", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const p = await criarProjetoDeTeste(cliente);
    const pool = criarPool();
    // Categoria que existe na tabela mas não está ligada a este projeto. `semeada = false`
    // é o que impede `criarProjeto` de adotá-la sozinha — e apagá-la no fim mantém o banco
    // de teste limpo para quem conta as categorias do projeto.
    const { rows } = await pool.query<{ id: string }>(
      "insert into categorias (nome, definicao, semeada) values ($1, $2, false) returning id",
      [`Solta ${Date.now()}`, { nome: "Solta", campos: [] }],
    );
    try {
      const r = await cliente.post(`/api/projetos/${p}/nos`, {
        titulo: "Intruso",
        categoria_id: rows[0].id,
      });
      assert.equal(r.status, 400);
    } finally {
      await pool.query("delete from categorias where id = $1", [rows[0].id]);
      await pool.end();
    }
  } finally {
    await fechar();
  }
});

test("POST /arestas grava o tipo armado e ele volta no GET /grafo", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const p = await criarProjetoDeTeste(cliente);
    await cliente.post(`/api/projetos/${p}/nos`, { titulo: "A" });
    await cliente.post(`/api/projetos/${p}/nos`, { titulo: "B" });
    await cliente.post(`/api/projetos/${p}/arestas`, { de: "a", para: "b", tipo: "excecao" });

    const g = (await (await cliente.get(`/api/projetos/${p}/grafo`)).json()) as {
      arestas: { tipo?: string }[];
    };
    assert.equal(g.arestas[0].tipo, "excecao");
  } finally {
    await fechar();
  }
});

test("seed é idempotente e atualiza a definição quando o YAML muda", async () => {
  const { base, pool, fechar } = await subirServidor();
  try {
    // Estraga a definição no banco e semeia de novo: o upsert tem de restaurá-la, senão
    // instalação já rodando nunca receberia objeto nem seta nova.
    await pool.query("update categorias set definicao = $1 where nome = 'Processo'", [
      { nome: "Processo", campos: [] },
    ]);
    const { semear } = await import("../migracoes/seed.ts");
    await semear(pool);
    await semear(pool); // duas vezes: não pode duplicar categoria nem vínculo

    const r = await pool.query<{ definicao: { arestas?: Record<string, { grupo?: string }> } }>(
      "select definicao from categorias where nome = 'Processo'",
    );
    assert.equal(r.rowCount, 1, "nome continua único");
    assert.equal(r.rows[0].definicao.arestas?.retrabalho?.grupo, "retorno");
    void base;
  } finally {
    await fechar();
  }
});
