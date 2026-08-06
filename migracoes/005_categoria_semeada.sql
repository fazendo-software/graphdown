-- `criarProjeto` vinculava TODA linha de `categorias` ao projeto novo. Qualquer categoria
-- que aparecesse na tabela — vinda de teste, de import futuro, de qualquer caminho que não
-- o seed — passava a aparecer na barra lateral de todo projeto criado depois dela.
--
-- `semeada` marca o catálogo que o seed mantém a partir dos YAMLs. Só esse conjunto entra
-- automaticamente num projeto novo.
alter table categorias add column semeada boolean not null default false;

-- Tudo que existe hoje veio do seed: não havia outro caminho para criar categoria.
update categorias set semeada = true;
