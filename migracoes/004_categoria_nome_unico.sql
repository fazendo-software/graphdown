-- O seed passou a fazer upsert por nome (`on conflict (nome)`), para que instalação já
-- rodando receba objeto e seta novos quando o YAML muda. `on conflict` exige um índice
-- único no alvo, e `categorias.nome` nunca teve um — a unicidade era garantida só pelo
-- advisory lock do seed.
--
-- Duplicata não deve existir (o lock impedia), mas se existir a criação do índice falha e a
-- migração reverte inteira, que é o certo: apagar categoria em silêncio deixaria nós órfãos.
create unique index categorias_nome_idx on categorias (nome);
