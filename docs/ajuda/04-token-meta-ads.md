---
id: token-meta-ads
titulo: Token da Meta para Tráfego (anúncios)
resumo: Gerar no Explorador da Graph API um token com as permissões de anúncios e colar em Tráfego.
ordem: 4
tags: tráfego, anúncios, ads, meta, token, graph api, explorer, ads_read
---
# Token da Meta para Tráfego

Serve para ver campanhas, conjuntos e anúncios em **Tráfego**, e para ler o Instagram de **concorrentes**. O ContentHub só **lê**: pausar, ativar e mudar orçamento ficam desligados.

## Permissões necessárias

- **ads_read**: ler a conta de anúncio.
- **instagram_basic** e **instagram_manage_insights**: ler o Instagram (concorrentes).
- **pages_show_list** e **pages_read_engagement**: achar o Instagram ligado à Página.

## Gerar no Explorador da Graph API

1. Abra o [Explorador da Graph API](https://developers.facebook.com/tools/explorer/).
2. No canto de cima à direita, escolha o app em **Meta App** (aparecem os apps em que você é administrador, desenvolvedor ou testador).
3. Em **Permissions** (Permissões), adicione as cinco permissões acima.
4. Clique no botão de gerar o token (na documentação aparece como **Get Access Token**; o nome pode variar) e aceite na janela da Meta.
5. Copie o token.

**O que você deve ver:** um texto longo que começa com **EAA**. O ícone de informação ao lado do token mostra o app e as permissões dadas.

Fonte oficial: [Graph API Explorer](https://developers.facebook.com/docs/graph-api/guides/explorer)

## Quanto tempo o token dura

- O token do Explorador é **de curta duração** (cerca de 1 a 2 horas, segundo a Meta).
- Um token de **longa duração** dura cerca de **60 dias**. A troca é feita por uma chamada de servidor com a chave secreta do app, por isso **peça ao suporte** para fazer a troca.
- A Meta avisa que essas durações podem mudar.

Fontes oficiais: [Tokens de longa duração](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived) e [Tokens de acesso](https://developers.facebook.com/docs/facebook-login/guides/access-tokens). Para conferir validade e permissões, a Meta tem a [ferramenta de tokens](https://developers.facebook.com/tools/accesstoken).

## Colar no ContentHub

1. No menu, clique em **Tráfego**.
2. Clique em **Conectar conta de anúncio da Meta**.
3. Informe a conta (começa com **act_**) e cole o token.
4. Clique em **Conectar** e depois em **Sincronizar agora**.

**O que você deve ver:** as campanhas dos últimos 90 dias.

## Tirar o acesso

Veja [Como tirar o acesso de um app](artigo:revogar-acesso).
