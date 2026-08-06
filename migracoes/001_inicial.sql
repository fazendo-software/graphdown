create extension if not exists pgcrypto;

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text not null,
  senha_hash text not null,          -- scrypt: sal + hash, formato do implementador
  criado_em timestamptz not null default now()
);

create table sessoes (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,   -- hash do token do cookie, nunca o token cru
  usuario_id uuid not null references usuarios(id) on delete cascade,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);
create index sessoes_usuario_idx on sessoes (usuario_id);

create table categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  definicao jsonb not null,          -- espelha o YAML inteiro: campos, campos_aresta,
                                     -- cor_por/cores, forma_por/formas, arestas (estilos)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria_id uuid not null references categorias(id),
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now()
);

create table projeto_membros (
  projeto_id uuid not null references projetos(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  papel text not null default 'editor',   -- dono | editor | leitor
  adicionado_em timestamptz not null default now(),
  primary key (projeto_id, usuario_id)
);

create table convites (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  token_hash text not null unique,
  papel text not null default 'editor',
  expira_em timestamptz not null,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);

-- valores do jsonb como texto, para indexar busca. imutável, exigido por coluna gerada.
create function campos_texto(c jsonb) returns text
  language sql immutable as
  $$ select coalesce(string_agg(value, ' '), '') from jsonb_each_text(c) $$;

create table nos (
  projeto_id uuid not null references projetos(id) on delete cascade,
  id text not null,                       -- slug estável, equivale ao nome do .md hoje
  titulo text not null,
  campos jsonb not null default '{}',
  corpo text not null default '',
  -- NULL de propósito: distingue "nunca posicionado" de "posicionado em (0,0)".
  -- Sem isso o layout automático (dagre) nunca dispara e projeto novo empilha tudo na origem.
  pos_x double precision,
  pos_y double precision,
  versao integer not null default 1,      -- incrementa a cada escrita de corpo; detecta conflito
  erro text,                              -- validação semântica, não mais erro de parse
  apagado_em timestamptz,                 -- soft delete: substitui .grapydown/trash/
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  busca_tsv tsvector generated always as (
    to_tsvector('portuguese', titulo || ' ' || corpo || ' ' || campos_texto(campos))
  ) stored,
  primary key (projeto_id, id)
);
create index nos_busca_idx on nos using gin (busca_tsv);

create table arestas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  de text not null,           -- SEM fk: id inexistente é fantasma, dado válido
  para text not null,
  quando text,
  tipo text,
  campos jsonb not null default '{}',
  criado_em timestamptz not null default now(),
  apagado_em timestamptz,
  foreign key (projeto_id, para) references nos(projeto_id, id) on delete cascade
);
-- Parcial, não constraint: sem o `where`, uma aresta apagada bloquearia recriar o mesmo par.
create unique index arestas_par_idx on arestas (projeto_id, de, para) where apagado_em is null;
create index arestas_de_idx on arestas (projeto_id, de);
create index arestas_para_idx on arestas (projeto_id, para);

create table notas (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  conteudo text not null default '',
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
