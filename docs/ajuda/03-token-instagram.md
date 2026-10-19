---
id: token-instagram
titulo: Token do Instagram
resumo: Gerar o token da conta e colar no ContentHub para ver números e comentários.
ordem: 3
tags: instagram, token, meta, app, conectar
---
# Token do Instagram

O token é a "chave" que deixa o ContentHub ler os números da conta. Ele é gerado no painel de desenvolvedor da Meta, dentro do app da plataforma.

> Quem gera o token precisa ter acesso ao app da Meta da plataforma. Se você é cliente, normalmente o suporte faz este passo com você.

## Gerar o token

:::fora Meta for Developers
link: https://developers.facebook.com/apps
caminho: Clique em **Meus apps** > Escolha o app da plataforma > No menu da esquerda, clique em **Instagram** > Depois em **API setup with Instagram business login** (o nome pode variar) > Ao lado da conta do Instagram, clique em **Generate token** (Gerar token) > Entre com a conta do Instagram (precisa ser profissional) e aceite as permissões > Copie o token
copie: o token, um texto longo que começa com **IG**
cole: **Configurações** › **Redes Sociais** › **Adicionar Conta** › campo **Cole aqui o token (começa com IG...)**
desenho: meta-dev-token-instagram
:::

**O que você deve ver:** um texto longo que começa com **IG**.

Segundo a documentação oficial, o token gerado no painel **vale 60 dias**. Fonte: [Instagram API com login do Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started.md)

## Colar no ContentHub

1. No menu, clique em **Configurações** e depois em **Redes Sociais**.
2. Clique em **Adicionar Conta**: abre o quadro **Conectar Instagram**.
3. Escolha o projeto e cole o token no campo **Cole aqui o token (começa com IG...)**.
4. Clique em **Validar e conectar** e depois em **Sincronizar agora**.

**O que você deve ver:** o @ da conta aparece em Instagram e os números chegam em alguns segundos.

## O que este acesso não faz

- Não lê anúncios: para isso existe o [token da Meta para Tráfego](artigo:token-meta-ads).
- Comentários de pessoas de fora só chegam depois que a Meta aprovar o app (análise do app). Veja [Comentários](artigo:comentarios).

## Tirar o acesso

Veja [Como tirar o acesso de um app](artigo:revogar-acesso).
