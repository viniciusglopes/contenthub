---
id: admin-ofertas
titulo: "Admin: módulo Ofertas e lista da casa"
resumo: Ligar o módulo por cliente, cuidar da lista da casa, do token da Biblioteca, dos países e das regras do selo.
ordem: 91
admin: true
tags: admin, ofertas, lista da casa, biblioteca de anúncios, token, selo
---
# Módulo Ofertas (administrador)

## Ligar para um cliente

1. Em **Clientes**, abra o cliente.
2. Marque **Módulo Ofertas (lista da casa)** e salve.

**O que você deve ver:** o cliente passa a ter a lista **Lista da casa** em Concorrentes › Ofertas, o contador de novas do dia e o relatório mensal. Desligado é o padrão.

## Cuidar da lista da casa

1. Em **Concorrentes › Ofertas › Lista da casa**, clique em **Adicionar à lista da casa**.
2. Preencha como uma oferta comum. Oferta adicionada hoje aparece como **nova hoje** para os clientes.
3. Para tirar, use a lixeira: a oferta é **arquivada** (some para os clientes, o histórico fica e dá para voltar editando).

## Token da Biblioteca de Anúncios (da casa)

1. Clique em **Configurar módulo**.
2. Cole o token de usuário de um app da Meta e clique em **Salvar token**, depois em **Testar**.

Antes, a pessoa dona do token precisa:

- confirmar identidade e localização em facebook.com/ID (a Meta leva alguns dias);
- aceitar os termos da API em facebook.com/ads/library/api.

A página de referência da Meta (developers.facebook.com/docs/graph-api/reference/ads_archive) não fala em análise do app para essa API; isso ainda não foi conferido com um token de verdade. Token de curta duração vence em horas: gere um de longa duração.

## Países e regras do selo

- **Países**: padrão, os 27 da União Europeia. A env `OFFERS_AD_COUNTRIES` (ex.: `PT,ES,FR`) manda mais que a tela.
- **Regras do selo**: lista em ordem; a primeira que bate vale. Campos: minCount, maxCount, minDelta7, maxDelta7, minDelta7Pct, maxDelta7Pct e tone. **Voltar ao padrão** desfaz.

## Rotina diária

`POST /api/ofertas/atualizar` com `Authorization: Bearer CRON_TOKEN` conta, uma vez por dia, as ofertas de contagem pela API de todos os clientes ativos e da lista da casa. Rodar duas vezes no mesmo dia só atualiza a foto do dia; contagem manual do dia não é sobrescrita.
