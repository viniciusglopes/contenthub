---
id: meta-app-automacoes
titulo: App da Meta para automações
resumo: Passo a passo do webhook, verificação da empresa e análise do app (permissões de comentário e mensagem).
ordem: 21
tags: meta, app, webhook, análise, app review, verificação, permissões, instagram_business_manage_messages
---
# App da Meta para automações

As automações dependem do app da Meta da plataforma. Este passo a passo é para quem administra o app (normalmente o suporte). Os nomes dos menus podem variar.

## 1. Permissões

O token da conta precisa destas três permissões:

- **instagram_business_basic**
- **instagram_business_manage_comments** (ler e responder comentários)
- **instagram_business_manage_messages** (mandar DM)

Gere o token de novo marcando as três (veja [Token do Instagram](artigo:token-instagram)).

## 2. Webhook (o Instagram avisa o ContentHub)

:::fora Meta for Developers
link: https://developers.facebook.com/apps
caminho: Escolha o app > No menu, clique em **Instagram** > Abra a parte **Configure webhooks** (o nome pode variar) > Em **Callback URL**, coloque `https://contenthub.vinculodigital.com.br/api/instagram/webhook` > Em **Verify token**, coloque o mesmo valor da variável `IG_WEBHOOK_VERIFY_TOKEN` do servidor > Clique em **Verify and save** > Assine os campos **comments**, **messages** e **messaging_postbacks**
cole: nada para colar no ContentHub; aqui você leva o endereço do ContentHub para a Meta
desenho: meta-dev-webhook-instagram
:::

Depois, no ContentHub, com as chaves ligadas, o suporte liga o webhook em cada conta (isso chama `POST /me/subscribed_apps` na Meta).

Cada aviso da Meta vem assinado com o segredo do app; o ContentHub confere a assinatura e descarta o que não confere. Fonte: [Webhooks do Instagram](https://developers.facebook.com/docs/instagram-platform/webhooks)

**O que você deve ver:** o painel da Meta aceita a URL. No modo de desenvolvimento, só chegam comentários e mensagens de pessoas com função no app (testadores).

## 3. Verificação da empresa

A Meta só dá o acesso avançado para empresa verificada.

:::fora Meta for Developers e Meta Business
link: https://business.facebook.com/settings/security
caminho: No painel do app, abra **Configurações do app** > Clique em **Básico** e confira qual portfólio empresarial é dono do app > No Meta Business desse portfólio, abra a **Central de Segurança** > Clique em **Iniciar verificação** e envie os documentos da empresa
desenho: meta-verificacao-empresa
:::

Fontes: [Níveis de acesso](https://developers.facebook.com/docs/graph-api/overview/access-levels) e [Verificação da empresa](https://developers.facebook.com/docs/development/release/business-verification)

## 4. Análise do app (App Review)

Antes, faça pelo menos uma chamada com sucesso de cada permissão (com uma conta testadora).

:::fora Meta for Developers
link: https://developers.facebook.com/apps
caminho: No painel do app, abra **Análise do app** > Clique em **Permissões e recursos** > Peça **acesso avançado** para as três permissões acima; para cada uma, explique o uso e envie um vídeo (screencast) com a tela em inglês mostrando o fluxo: comentário com a palavra, resposta pública, DM com link, contato na lista > Depois de aprovado, coloque o app no modo **Ao vivo** (Live)
desenho: meta-dev-app-review
:::

Fontes: [Análise do app do Instagram](https://developers.facebook.com/docs/instagram-platform/app-review) e [Modos do app](https://developers.facebook.com/docs/development/build-and-test/app-modes)

## 5. Contas de clientes

Para contas que não são da própria empresa dona do app, a Meta pede também a verificação de acesso de provedor de tecnologia (Tech Provider). Fonte: [Access Verification](https://developers.facebook.com/docs/development/release/access-verification)

> **Importante:** o ContentHub não usa a etiqueta HUMAN_AGENT nem manda mensagem fora das 24 horas. Não vender a automação a cliente antes da aprovação da Meta.
