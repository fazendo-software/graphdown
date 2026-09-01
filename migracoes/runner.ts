import type { Pool } from "../servidor/db.ts";

const UUID = "lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))";

/** Schema único local: o AppImage sempre inicia seu próprio banco SQLite. */
export async function migrar(pool: Pool): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    await cliente.query(`
      create table if not exists usuarios (id text primary key default (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))), email text not null unique, nome text not null, senha_hash text not null, criado_em text not null default CURRENT_TIMESTAMP);
      create table if not exists sessoes (id text primary key default (${UUID}), token_hash text not null unique, usuario_id text not null references usuarios(id) on delete cascade, expira_em text not null, criado_em text not null default CURRENT_TIMESTAMP);
      create table if not exists categorias (id text primary key default (${UUID}), nome text not null unique, definicao text not null, semeada integer not null default 0, criado_em text not null default CURRENT_TIMESTAMP, atualizado_em text not null default CURRENT_TIMESTAMP);
      create table if not exists projetos (id text primary key default (${UUID}), nome text not null, categoria_id text not null references categorias(id), criado_por text references usuarios(id), criado_em text not null default CURRENT_TIMESTAMP);
      create table if not exists projeto_membros (projeto_id text not null references projetos(id) on delete cascade, usuario_id text not null references usuarios(id) on delete cascade, papel text not null default 'editor', adicionado_em text not null default CURRENT_TIMESTAMP, primary key (projeto_id, usuario_id));
      create table if not exists projeto_categorias (projeto_id text not null references projetos(id) on delete cascade, categoria_id text not null references categorias(id), ordem integer not null default 0, primary key (projeto_id, categoria_id));
      create table if not exists convites (id text primary key default (${UUID}), projeto_id text not null references projetos(id) on delete cascade, token_hash text not null unique, papel text not null default 'editor', expira_em text not null, usado_em text, criado_em text not null default CURRENT_TIMESTAMP);
      create table if not exists nos (projeto_id text not null references projetos(id) on delete cascade, id text not null, titulo text not null, categoria_id text not null references categorias(id), campos text not null default '{}', corpo text not null default '', pos_x real, pos_y real, versao integer not null default 1, erro text, apagado_em text, criado_por text references usuarios(id), criado_em text not null default CURRENT_TIMESTAMP, atualizado_em text not null default CURRENT_TIMESTAMP, eh_tarefa integer not null default 0, estado_execucao text check (estado_execucao in ('pendente', 'em_andamento', 'concluido', 'bloqueado')), primary key (projeto_id, id), check ((eh_tarefa = 0 and estado_execucao is null) or (eh_tarefa = 1 and estado_execucao is not null)));
      create table if not exists arestas (id text primary key default (${UUID}), projeto_id text not null references projetos(id) on delete cascade, de text not null, para text not null, quando text, tipo text, campos text not null default '{}', criado_em text not null default CURRENT_TIMESTAMP, apagado_em text, foreign key (projeto_id, para) references nos(projeto_id, id) on delete cascade);
      create table if not exists notas (id text primary key default (${UUID}), projeto_id text not null references projetos(id) on delete cascade, conteudo text not null default '', pos_x real not null default 0, pos_y real not null default 0, criado_por text references usuarios(id), criado_em text not null default CURRENT_TIMESTAMP, atualizado_em text not null default CURRENT_TIMESTAMP);
      create table if not exists objetos_seta (id text primary key default (${UUID}), projeto_id text not null references projetos(id) on delete cascade, tipo text not null, pontos text not null, criado_por text references usuarios(id), criado_em text not null default CURRENT_TIMESTAMP, atualizado_em text not null default CURRENT_TIMESTAMP);
      create unique index if not exists arestas_par_idx on arestas(projeto_id, de, para) where apagado_em is null;
      create index if not exists objetos_seta_projeto_idx on objetos_seta(projeto_id, criado_em);
    `);
    await cliente.query("commit");
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}
