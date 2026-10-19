---
id: meta-lead-ads
titulo: Formulários da Meta no CRM
resumo: Passo a passo para os leads do formulário de cadastro do anúncio entrarem sozinhos no CRM.
ordem: 25
tags: meta, lead ads, formulário, leadgen, webhook, página, token, leads_retrieval, crm
---
# Formulários da Meta no CRM

Este passo a passo liga o formulário de cadastro dos anúncios (Lead Ads) ao CRM. Os nomes dos menus da Meta podem variar.

## Como funciona

1. A pessoa preenche o formulário no anúncio.
2. A Meta avisa o ContentHub (só o número do lead, sem os dados).
3. O ContentHub busca o lead na Meta com o token da Página (só leitura) e cria no funil, com campanha, conjunto e anúncio.

Fontes: [Webhooks para Lead Ads](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen) e [Como ler os leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving)

## 1. App da Meta (quem administra o app, normalmente o suporte)

:::fora Meta for Developers
link: https://developers.facebook.com/apps
caminho: Escolha o app > Adicione o produto **Webhooks** > Escolha o objeto **Page** > Em **Callback URL**, coloque o endereço que aparece no CRM, aba **Entradas**, **Formulário da Meta** (termina em `/api/crm/lead-ads/webhook`) > Em **Verify token**, coloque o valor da variável `LEAD_ADS_VERIFY_TOKEN` do servidor > Clique em **Verify and save** > Assine o campo **leadgen**
copie: no ContentHub, o endereço (Callback URL) que está em CRM › Entradas › Formulário da Meta, e cole lá na Meta
desenho: meta-dev-webhook-leadgen
:::

O servidor precisa da chave secreta do app em `META_APP_SECRET`: todo aviso vem assinado e o ContentHub descarta o que não confere.

Permissões que a Meta lista para isso: **leads_retrieval**, **pages_manage_metadata**, **pages_show_list**, **pages_read_engagement** e **ads_management**. O token precisa ser de alguém que pode anunciar pela Página.

## 2. Instalar o app na Página

A Meta só avisa apps instalados na Página. Quem administra a Página faz a instalação (no Graph API Explorer, `POST /{id-da-página}/subscribed_apps` com `subscribed_fields=leadgen` e o token da Página). O ContentHub não faz essa chamada sozinho.

**O que você deve ver:** na ferramenta de teste de leads da Meta, o app aparece como inscrito na Página.

## 3. Cadastrar a Página no CRM

Primeiro pegue o id e o token da Página:

:::fora Facebook
link: https://www.facebook.com/
caminho: Abra a sua Página > Clique em **Sobre** > Abra **Transparência da Página** > Copie o **ID da Página**
copie: o ID da Página (só números)
cole: **CRM** › **Entradas** › **Formulário da Meta** › **Cadastrar Página** › campo do id da Página
desenho: facebook-pagina-id
obs: O nome dos menus pode variar. O id também aparece no Explorador da Graph API ao escolher a Página.
:::

:::fora Explorador da Graph API
link: https://developers.facebook.com/tools/explorer/
caminho: Em **Meta App**, escolha o app > Em **Permissions**, adicione **leads_retrieval**, **pages_manage_metadata**, **pages_show_list**, **pages_read_engagement** e **ads_management** > Clique no botão de gerar o token e aceite na janela da Meta > Em **User or Page**, escolha a Página > Copie o token da Página
copie: o token da Página (começa com **EAA**)
cole: **CRM** › **Entradas** › **Formulário da Meta** › **Cadastrar Página** › campo do token
desenho: meta-graph-explorer-pagina
obs: O token do Explorador dura pouco. Peça ao suporte o de longa duração, como no [token da Meta para Tráfego](artigo:token-meta-ads).
:::

1. No CRM, aba **Entradas**, **Formulário da Meta**, clique em **Cadastrar Página** (só o dono da conta).
2. Cole o id da Página e o token da Página (com **leads_retrieval**). O ContentHub confere o token com uma leitura e guarda criptografado.
3. Escolha a etapa, o responsável e as etiquetas dos leads que vierem dela.

## 4. Ligar

O suporte liga a chave **CRM: leads dos formulários da Meta** em Admin, Clientes. Sem ela (e sem a chave geral do servidor), os avisos não são guardados.

## Testar

Use a ferramenta de teste de leads da Meta para criar um lead de teste. Em **Últimos avisos da Meta** aparece a situação: na fila, no CRM ou falhou (com o motivo). Erro passageiro da Meta tenta de novo sozinho; token vencido aparece na Página até você colar um novo.

> **Importante:** o lead do formulário é guardado com o consentimento "formulário da Meta" (o formulário mostra a política de privacidade do anunciante). Confira que o seu formulário tem o link da sua política.
