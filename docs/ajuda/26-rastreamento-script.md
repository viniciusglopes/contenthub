---
id: rastreamento-script
titulo: Rastreamento: instalar o script no site
resumo: Script próprio que guarda de onde a pessoa veio (UTM, clique do anúncio), cria o lead do formulário e marca os links do checkout.
ordem: 26
tags: rastreamento, script, utm, fbclid, fbc, fbp, gclid, ttclid, cookie, consentimento, checkout, src, sck, hotmart, kiwify
---
# Rastreamento: instalar o script no site

O script do ContentHub é pequeno e roda no **seu** domínio (cookie primário, sem depender de terceiros). Ele guarda de onde a pessoa veio e leva essa origem até a venda.

## O que ele faz

- Lê as UTMs (`utm_source`, `utm_campaign`...), o clique do anúncio (`fbclid`, que vira o `fbc` da Meta, `gclid`, `ttclid`), a página de entrada e de qual site a pessoa veio.
- Guarda o **primeiro** e o **último toque** num cookie do seu site por até 13 meses.
- Manda ao ContentHub as visitas, os leads e os cliques no checkout.
- Marca os links de checkout (Hotmart, Kiwify, Eduzz, Monetizze, Lastlink, Perfect Pay, Greenn, Ticto) com `src` e `sck` (o código do visitante) e as UTMs. É assim que a venda volta ligada ao lead e à campanha.

## Instalar

1. No CRM, aba **Rastreamento**, escolha o projeto e clique em **Criar script**.
2. Copie a linha `<script ...>` e cole antes de `</head>` em todas as páginas: site, página de vendas, página de obrigado.
3. Em **Domínios do site**, coloque os seus domínios (o ContentHub recusa evento de outro lugar).
4. Clique em **Salvar**.

**O que você deve ver:** ao abrir o site e aceitar os cookies, o contador de eventos do script sobe.

## Formulário vira lead

No seu formulário, acrescente `data-ch-lead` na tag `<form>` e uma caixinha de autorização com `name="ch_consent"`. Os campos `name`, `email` e `phone` (ou `nome`, `telefone`, `whatsapp`) entram no CRM, com as UTMs do visitante. Sem a caixinha marcada, nada é guardado.

Quem tem formulário próprio pode chamar `chTrack.lead({ name, email, phone, consent: true })` depois do envio.

## Cookies e LGPD

Com **Só rastrear depois do aceite** ligado (padrão), o script não grava cookie nem manda nada até a pessoa aceitar. O aviso de cookies do ContentHub aparece sozinho; se o seu site já tem um, desligue o nosso e chame `chTrack.consent(true)` quando a pessoa aceitar (ou `chTrack.consent(false)` para apagar os cookies).

O que fica guardado: o código do visitante, os toques (UTMs, ids de anúncio, clique), `fbc`/`fbp` e as páginas visitadas (sem a parte da consulta). Eventos somem em 180 dias; o visitante, 13 meses depois da última visita. Excluir o lead a pedido apaga as visitas dele.

## Ids das campanhas

Para o relatório ligar o lead ao gasto, use os parâmetros dinâmicos da Meta nos links do anúncio, por exemplo `utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`. Com o **nome** da campanha, o relatório liga pelo nome e marca como estimativa. Veja [Relatórios do CRM](artigo:crm-relatorios).
