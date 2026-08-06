-- Um projeto passa a misturar várias categorias (Processo + Dados + Atores), então a
-- categoria deixa de ser propriedade do projeto e vira propriedade de cada nó.
--
-- `projetos.categoria_id` sobrevive como a categoria PRINCIPAL: é o default de `POST /nos`
-- e é ela que vence na fusão dos estilos de seta. Sem ela, "qual seta é a padrão deste
-- projeto" não teria resposta.
--
-- Só estrutura aqui. Semear as categorias novas e religar os nós de `ator` é trabalho do
-- seed, que roda DEPOIS das migrações e por isso é o único lugar onde as categorias novas
-- já existem.

create table projeto_categorias (
  projeto_id uuid not null references projetos(id) on delete cascade,
  categoria_id uuid not null references categorias(id),
  -- Ordem na barra lateral E precedência na fusão de `arestas`/`campos_aresta`.
  ordem integer not null default 0,
  primary key (projeto_id, categoria_id)
);
create index projeto_categorias_projeto_idx on projeto_categorias (projeto_id, ordem);

-- Todo projeto existente já usa exatamente uma categoria: ela vira a principal (ordem 0).
insert into projeto_categorias (projeto_id, categoria_id, ordem)
select id, categoria_id, 0 from projetos
on conflict do nothing;

-- Nullable primeiro para poder preencher; NOT NULL logo abaixo, depois do backfill.
alter table nos add column categoria_id uuid references categorias(id);

update nos n
   set categoria_id = p.categoria_id
  from projetos p
 where p.id = n.projeto_id and n.categoria_id is null;

-- Nó órfão não existe (FK de projeto_id). Se o backfill deixasse algum nulo, este comando
-- falharia e a migração inteira reverteria — que é o comportamento certo.
alter table nos alter column categoria_id set not null;
