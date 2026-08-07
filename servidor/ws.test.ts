import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { criarPool } from "./db.ts";
import { clienteCookies, criarProjetoDeTeste, registrar, subirServidor } from "./testeApoio.ts";

function esperarAbrir(ws: WebSocket): Promise<void> {
  return new Promise((ok, falhar) => {
    ws.once("open", () => ok());
    ws.once("error", falhar);
  });
}

function esperarFechar(ws: WebSocket): Promise<number> {
  return new Promise((ok) => ws.once("close", (codigo) => ok(codigo)));
}

function esperarMensagem(ws: WebSocket, tipo: string): Promise<any> {
  return new Promise((ok) => {
    ws.on("message", (dados) => {
      const msg = JSON.parse(dados.toString());
      if (msg.t === tipo) ok(msg);
    });
  });
}

test("upgrade sem cookie de sessão é recusado", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const ws = new WebSocket(`${base.replace("http", "ws")}/ws?projeto=${projetoId}`, {
      headers: { origin: base },
    });
    await assert.rejects(() => esperarAbrir(ws));
  } finally {
    await fechar();
  }
});

test("upgrade sem membership é recusado", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const dono = await registrar(base);
    const projetoId = await criarProjetoDeTeste(dono.cliente);
    const semAcesso = await registrar(base);
    const ws = new WebSocket(`${base.replace("http", "ws")}/ws?projeto=${projetoId}`, {
      headers: { cookie: semAcesso.cliente.cookie(), origin: base },
    });
    await assert.rejects(() => esperarAbrir(ws));
  } finally {
    await fechar();
  }
});

test("Origin diferente do host é recusado no handshake", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const ws = new WebSocket(`${base.replace("http", "ws")}/ws?projeto=${projetoId}`, {
      headers: { cookie: cliente.cookie(), origin: "http://site-malicioso.example" },
    });
    await assert.rejects(() => esperarAbrir(ws));
  } finally {
    await fechar();
  }
});

test("soltou persiste posição e outro cliente na sala recebe 'posicao'", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const { id } = await (await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Nó" })).json();

    const wsA = new WebSocket(`${base.replace("http", "ws")}/ws?projeto=${projetoId}`, {
      headers: { cookie: cliente.cookie(), origin: base },
    });
    await esperarAbrir(wsA);
    const wsB = new WebSocket(`${base.replace("http", "ws")}/ws?projeto=${projetoId}`, {
      headers: { cookie: cliente.cookie(), origin: base },
    });
    await esperarAbrir(wsB);

    const recebida = esperarMensagem(wsB, "posicao");
    wsA.send(JSON.stringify({ t: "soltou", no: id, x: 10, y: 20 }));
    const msg = await recebida;
    assert.equal(msg.no, id);
    assert.equal(msg.x, 10);
    assert.equal(msg.y, 20);

    const g = await (await cliente.get(`/api/projetos/${projetoId}/grafo`)).json();
    assert.deepEqual(g.layout[id], { x: 10, y: 20 });

    wsA.close();
    wsB.close();
  } finally {
    await fechar();
  }
});

test("leitor não persiste posição — recebe erro e o layout continua vazio", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const dono = await registrar(base);
    const projetoId = await criarProjetoDeTeste(dono.cliente);
    const { id } = await (
      await dono.cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Nó" })
    ).json();

    const leitor = await registrar(base);
    const pool = criarPool();
    await pool.query("insert into projeto_membros (projeto_id, usuario_id, papel) values ($1, $2, 'leitor')", [
      projetoId,
      leitor.usuarioId,
    ]);
    await pool.end();

    const ws = new WebSocket(`${base.replace("http", "ws")}/ws?projeto=${projetoId}`, {
      headers: { cookie: leitor.cliente.cookie(), origin: base },
    });
    await esperarAbrir(ws);
    const erro = esperarMensagem(ws, "erro");
    ws.send(JSON.stringify({ t: "soltou", no: id, x: 1, y: 1 }));
    await erro;

    const g = await (await dono.cliente.get(`/api/projetos/${projetoId}/grafo`)).json();
    assert.deepEqual(g.layout, {});
    ws.close();
  } finally {
    await fechar();
  }
});

test("logout fecha ativamente os sockets daquela sessão", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const ws = new WebSocket(`${base.replace("http", "ws")}/ws?projeto=${projetoId}`, {
      headers: { cookie: cliente.cookie(), origin: base },
    });
    await esperarAbrir(ws);
    const fechado = esperarFechar(ws);
    await cliente.post("/api/auth/sair");
    const codigo = await fechado;
    assert.equal(codigo, 4001);
  } finally {
    await fechar();
  }
});

test("PATCH de título, campos e execução emite um único 'no-mudou' já normalizado", async () => {
  const { base, fechar } = await subirServidor();
  try {
    const { cliente } = await registrar(base);
    const projetoId = await criarProjetoDeTeste(cliente);
    const { id } = await (
      await cliente.post(`/api/projetos/${projetoId}/nos`, { titulo: "Etapa", campos: { responsavel: "rh" } })
    ).json();

    const ws = new WebSocket(`${base.replace("http", "ws")}/ws?projeto=${projetoId}`, {
      headers: { cookie: cliente.cookie(), origin: base },
    });
    await esperarAbrir(ws);

    const mudancas: any[] = [];
    ws.on("message", (dados) => {
      const msg = JSON.parse(dados.toString());
      if (msg.t === "no-mudou") mudancas.push(msg.no);
    });

    const recebida = esperarMensagem(ws, "no-mudou");
    await cliente.patch(`/api/projetos/${projetoId}/nos/${id}`, {
      titulo: "Etapa revisada",
      campos: { status: "ativo" },
      execucao: { tarefa: true },
    });
    const msg = await recebida;

    // Sem estado intermediário: a primeira (e única) mensagem já traz as três mudanças.
    assert.equal(msg.no.titulo, "Etapa revisada");
    assert.equal(msg.no.campos.status, "ativo");
    assert.deepEqual(msg.no.execucao, { tarefa: true, estado: "pendente" });

    // Um segundo broadcast sairia no mesmo tick da resposta HTTP; a folga é generosa.
    await new Promise((ok) => setTimeout(ok, 200));
    assert.equal(mudancas.length, 1, "uma atualização lógica, um broadcast");

    ws.close();
  } finally {
    await fechar();
  }
});
