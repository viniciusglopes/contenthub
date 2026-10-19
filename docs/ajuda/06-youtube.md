---
id: youtube
titulo: YouTube: chave para concorrentes
resumo: Onde fica a chave do YouTube e como criar uma própria no Google Cloud.
ordem: 6
tags: youtube, google, chave, api, concorrentes
---
# YouTube

O ContentHub usa o YouTube para ler canais públicos de **concorrentes** (inscritos, vídeos e visualizações). Não publica no YouTube.

## Já funciona sem você fazer nada?

Se a plataforma tem a chave da casa, sim. Na lista de [Primeiros passos](artigo:primeiros-passos) o passo YouTube aparece como **feito**.

## Criar uma chave própria (opcional)

:::fora Console do Google Cloud
link: https://console.cloud.google.com/apis/credentials
caminho: Crie ou escolha um projeto, no alto > No menu, abra **APIs e serviços** > Em **Biblioteca**, procure **YouTube Data API v3** e clique em **Ativar** > Volte e clique em **Credenciais** > Clique em **Criar credenciais** e depois em **Chave de API** > Copie a chave
copie: a chave, que começa com **AIza**
cole: **Configurações** › **APIs de Produção** › **Adicionar API** › **YouTube Data API (concorrentes)**
desenho: google-cloud-chave
:::

**O que você deve ver:** uma chave que começa com **AIza**.

O limite gratuito padrão é de **10.000 unidades por dia**; ler um canal custa poucas unidades. O Google avisa que esses números podem mudar.

Fontes oficiais: [Primeiros passos da API do YouTube](https://developers.google.com/youtube/v3/getting-started) e [Criar chave de API](https://support.google.com/googleapi/answer/6158862)

## Onde colar

No ContentHub: **Configurações**, aba **APIs de Produção**, **Adicionar API**, escolha **YouTube Data API (concorrentes)**, cole a chave e salve. A sua chave passa a valer no lugar da chave da plataforma.
