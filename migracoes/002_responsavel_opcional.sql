with categorias_atualizadas as (
  update categorias
     set definicao = jsonb_set(
           definicao,
           '{campos}',
           (
             select jsonb_agg(
               case when campo->>'chave' = 'responsavel' then campo - 'obrigatorio' else campo end
             )
             from jsonb_array_elements(definicao->'campos') as campo
           )
         ),
         atualizado_em = now()
   where nome = 'Processo' and jsonb_typeof(definicao->'campos') = 'array'
   returning id
)
update nos
   set erro = null,
       atualizado_em = now()
 where erro = 'campo obrigatório vazio: responsavel'
   and projeto_id in (
     select projetos.id
       from projetos
       join categorias_atualizadas on categorias_atualizadas.id = projetos.categoria_id
   );
