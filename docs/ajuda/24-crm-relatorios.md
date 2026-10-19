---
id: crm-relatorios
titulo: Relatórios do CRM e custo por lead
resumo: Leads e vendas por campanha, conjunto, anúncio, post e origem; custo por lead e por venda com o gasto do Tráfego.
ordem: 24
tags: crm, relatório, custo por lead, cpl, custo por venda, campanha, anúncio, post, atribuição, primeiro toque, último toque, utm
---
# Relatórios do CRM e custo por lead

Na aba **Relatórios** do CRM, escolha o período e como agrupar: **Campanha**, **Conjunto**, **Anúncio**, **Post** ou **Origem**.

## O que cada número quer dizer

- **Leads**: quem entrou no CRM dentro do período.
- **Vendas**: desses leads, quantos estão hoje numa etapa de ganho. **Valor** soma o valor deles.
- **Gasto**: o que o **Tráfego** registrou no mesmo período para aquele id de campanha, conjunto ou anúncio.
- **Meta contou**: os leads que a própria Meta informou para aquele id (para comparar com os que chegaram de verdade).
- **Custo/lead** e **Custo/venda**: gasto dividido por leads ou por vendas.

## Quando aparece custo

O custo só aparece quando o id do lead é o mesmo id do gasto:

- **mesmo id**: o lead veio do formulário da Meta ou de anúncio para o direct, ou da página de captura com `utm_campaign` igual ao id da campanha (a Meta preenche com `{{campaign.id}}`).
- **estimativa**: ligação indireta. Por post, soma o gasto dos anúncios feitos a partir daquele post. Por UTM com o **nome** da campanha, liga pelo nome.
- **sem custo**: lead sem id de anúncio (direct orgânico, planilha, cadastro à mão) ou UTM que não bate com nenhuma campanha.

Para o custo funcionar, conecte a conta de anúncio no **Tráfego** e sincronize o período. Veja [Tráfego](artigo:trafego).

## Primeiro e último toque

Cada lead guarda o **primeiro toque** (por onde chegou da primeira vez) e o **último toque** (a interação mais recente que trouxe ele de volta). Escolha no seletor qual usar. O primeiro toque mostra o que gera lead novo; o último mostra o que reativa quem já estava na base.

## Exportar

O botão **CSV** baixa a tabela do jeito que está na tela, com a coluna de base do custo.
