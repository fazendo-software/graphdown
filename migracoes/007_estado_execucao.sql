-- Estado de execução é dado semântico do nó, não cor nem campo de categoria: um projeto
-- pode ter um campo YAML chamado `status` com outro significado. Aditiva de propósito —
-- todo nó existente continua informativo (`eh_tarefa = false`) e fora da métrica.
alter table nos
  add column eh_tarefa boolean not null default false,
  add column estado_execucao text
    check (estado_execucao in ('pendente', 'em_andamento', 'concluido', 'bloqueado')),
  -- Tarefa sem estado e informativo com estado são dados impossíveis, não casos a tratar
  -- no cliente. O servidor normaliza antes de escrever; isto é a rede de segurança.
  add constraint nos_execucao_coerente check (
    (not eh_tarefa and estado_execucao is null) or (eh_tarefa and estado_execucao is not null)
  );
