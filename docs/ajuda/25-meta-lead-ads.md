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

1. Abra o app em [developers.facebook.com](https://developers.facebook.com/apps) e adicione o produto **Webhooks**.
2. Escolha o objeto **Page** e assine o campo **leadgen**.
3. Em **Callback URL**, coloque o endereço que aparece no CRM, aba **Entradas**, **Formulário da Meta** (termina em `/api/crm/lead-ads/webhook`).
4. Em **Verify token**, coloque o valor da variável `LEAD_ADS_VERIFY_TOKEN` do servidor e clique em **Verify and save**.
5. O servidor precisa da chave secreta do app em `META_APP_SECRET`: todo aviso vem assinado e o ContentHub descarta o que não confere.

Permissões que a Meta lista para isso: **leads_retrieval**, **pages_manage_metadata**, **pages_show_list**, **pages_read_engagement** e **ads_management**. O token precisa ser de alguém que pode anunciar pela Página.

## 2. Instalar o app na Página

A Meta só avisa apps instalados na Página. Quem administra a Página faz a instalação (no Graph API Explorer, `POST /{id-da-página}/subscribed_apps` com `subscribed_fields=leadgen` e o token da Página). O ContentHub não faz essa chamada sozinho.

**O que você deve ver:** na ferramenta de teste de leads da Meta, o app aparece como inscrito na Página.

## 3. Cadastrar a Página no CRM

1. No CRM, aba **Entradas**, **Formulário da Meta**, clique em **Cadastrar Página** (só o dono da conta).
2. Cole o id da Página e o token da Página (com **leads_retrieval**). O ContentHub confere o token com uma leitura e guarda criptografado.
3. Escolha a etapa, o responsável e as etiquetas dos leads que vierem dela.

## 4. Ligar

O suporte liga a chave **CRM: leads dos formulários da Meta** em Admin, Clientes. Sem ela (e sem a chave geral do servidor), os avisos não são guardados.

## Testar

Use a ferramenta de teste de leads da Meta para criar um lead de teste. Em **Últimos avisos da Meta** aparece a situação: na fila, no CRM ou falhou (com o motivo). Erro passageiro da Meta tenta de novo sozinho; token vencido aparece na Página até você colar um novo.

> **Importante:** o lead do formulário é guardado com o consentimento "formulário da Meta" (o formulário mostra a política de privacidade do anunciante). Confira que o seu formulário tem o link da sua política.
