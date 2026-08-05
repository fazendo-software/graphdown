---
titulo: Provisionamento de contas
tipo: passo
responsavel: ti
status: bloqueado
depende_de:
  - de: 04-aprovou
    quando: aprovado
    prazo: 1d
    pessoas: 2 analistas
    custo: R$ 1.200
    esforco: 6h-homem
    material: notebook + licenças
  - { de: ti, tipo: dado }
---
Cria conta no diretório, email e acessos do cargo.
