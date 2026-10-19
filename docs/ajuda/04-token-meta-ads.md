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

:::fora Explorador da Graph API
link: https://developers.facebook.com/tools/explorer/
caminho: Em **Meta App**, escolha o app (aparecem os apps em que você é administrador, desenvolvedor ou testador) > Em **Permissions** (Permissões), adicione as cinco permissões acima > Clique no botão de gerar o token (na documentação aparece como **Get Access Token**; o nome pode variar) > Aceite na janela da Meta > Copie o token
copie: o token, um texto longo que começa com **EAA**
cole: **Tráfego** › **Conectar conta de anúncio da Meta** (ou **Outra conta**) › campo **Token de acesso**
desenho: meta-graph-explorer
:::

**O que você deve ver:** um texto longo que começa com **EAA**. O ícone de informação ao lado do token mostra o app e as permissões dadas.

Fonte oficial: [Graph API Explorer](https://developers.facebook.com/docs/graph-api/guides/explorer)

## Achar o número da conta de anúncio

:::fora Configurações do negócio (Meta Business)
link: https://business.facebook.com/settings
caminho: Escolha o portfólio empresarial, no alto > No menu, clique em **Contas** > Depois em **Contas de anúncios** > Clique na conta > Copie a **identificação** (só números)
copie: o número da conta (o ContentHub aceita com ou sem **act_** na frente)
cole: **Tráfego** › **Conectar conta de anúncio da Meta** › campo **ID da conta de anúncio**
desenho: meta-business-conta-anuncio
obs: Também aparece no Gerenciador de Anúncios, no seletor de contas. Os nomes dos menus podem variar.
:::

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
