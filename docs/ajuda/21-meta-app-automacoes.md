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

1. Abra o app em [developers.facebook.com](https://developers.facebook.com/apps).
2. Vá em **Instagram** e depois em **Configure webhooks** (o nome pode variar).
3. Em **Callback URL**, coloque: `https://contenthub.vinculodigital.com.br/api/instagram/webhook`
4. Em **Verify token**, coloque o mesmo valor da variável `IG_WEBHOOK_VERIFY_TOKEN` do servidor e clique em **Verify and save**.
5. Assine os campos **comments**, **messages** e **messaging_postbacks**.
6. No ContentHub, com as chaves ligadas, o suporte liga o webhook em cada conta (isso chama `POST /me/subscribed_apps` na Meta).

Cada aviso da Meta vem assinado com o segredo do app; o ContentHub confere a assinatura e descarta o que não confere. Fonte: [Webhooks do Instagram](https://developers.facebook.com/docs/instagram-platform/webhooks)

**O que você deve ver:** o painel da Meta aceita a URL. No modo de desenvolvimento, só chegam comentários e mensagens de pessoas com função no app (testadores).

## 3. Verificação da empresa

A Meta só dá o acesso avançado para empresa verificada.

1. No painel do app, abra **Configurações do app** e depois **Básico**, e confira qual portfólio empresarial é dono do app.
2. Na Central de Segurança do portfólio, clique em **Iniciar verificação** e envie os documentos da empresa.

Fontes: [Níveis de acesso](https://developers.facebook.com/docs/graph-api/overview/access-levels) e [Verificação da empresa](https://developers.facebook.com/docs/development/release/business-verification)

## 4. Análise do app (App Review)

1. No painel do app, abra **Análise do app** e depois **Permissões e recursos**.
2. Peça **acesso avançado** para as três permissões acima.
3. Para cada uma, explique o uso e envie um vídeo (screencast) com a tela em inglês mostrando o fluxo: comentário com a palavra, resposta pública, DM com link, contato na lista.
4. Faça antes pelo menos uma chamada com sucesso de cada permissão (com uma conta testadora).
5. Depois de aprovado, coloque o app no modo **Ao vivo** (Live).

Fontes: [Análise do app do Instagram](https://developers.facebook.com/docs/instagram-platform/app-review) e [Modos do app](https://developers.facebook.com/docs/development/build-and-test/app-modes)

## 5. Contas de clientes

Para contas que não são da própria empresa dona do app, a Meta pede também a verificação de acesso de provedor de tecnologia (Tech Provider). Fonte: [Access Verification](https://developers.facebook.com/docs/development/release/access-verification)

> **Importante:** o ContentHub não usa a etiqueta HUMAN_AGENT nem manda mensagem fora das 24 horas. Não vender a automação a cliente antes da aprovação da Meta.
