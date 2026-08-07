-- Setas livres são desenhos do canvas, sem referências a nós. Por isso apagar um nó não
-- pode apagar uma anotação visual feita durante uma reunião.
create table objetos_seta (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references projetos(id) on delete cascade,
  tipo text not null,
  pontos jsonb not null,
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index objetos_seta_projeto_idx on objetos_seta (projeto_id, criado_em);
