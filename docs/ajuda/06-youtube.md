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

1. Abra o [Console de APIs do Google](https://console.cloud.google.com/) e crie ou escolha um projeto.
2. Ative a **YouTube Data API v3** (em **APIs ativadas**; se não aparecer, procure na **Biblioteca de APIs**).
3. Vá em **APIs e serviços** e depois **Credenciais**.
4. Clique em **Criar credenciais** e depois **Chave de API**.
5. Copie a chave.

**O que você deve ver:** uma chave que começa com **AIza**.

O limite gratuito padrão é de **10.000 unidades por dia**; ler um canal custa poucas unidades. O Google avisa que esses números podem mudar.

Fontes oficiais: [Primeiros passos da API do YouTube](https://developers.google.com/youtube/v3/getting-started) e [Criar chave de API](https://support.google.com/googleapi/answer/6158862)

## Onde colar

No ContentHub: **Configurações**, aba **APIs de Produção**, **Adicionar API**, escolha **YouTube Data API (concorrentes)**, cole a chave e salve. A sua chave passa a valer no lugar da chave da plataforma.
