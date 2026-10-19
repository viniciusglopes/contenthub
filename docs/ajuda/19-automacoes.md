---
id: automacoes
titulo: Automações do direct
resumo: Quem comentar uma palavra recebe resposta pública e DM com link; palavra no direct, botões e teste.
ordem: 19
tags: automações, manychat, comentário, dm, direct, palavra, gatilho, link, ensaio
---
# Automações do direct

Exemplo: quem comentar **QUERO** no próximo post recebe uma resposta no comentário e uma DM com o link do material.

## Criar

1. No menu, clique em **Automações** e depois em **Nova automação**.
2. **Quando:** escolha **Comentou no post** (próximo post, posts escolhidos ou todos) ou **Mandou mensagem no direct**, e escreva as palavras. Acento e maiúscula não fazem diferença.
3. **Resposta pública:** até 3 textos. Eles são usados em rodízio, porque textos iguais em sequência parecem robô para o Instagram.
4. **DM:** a mensagem, com até 3 botões (link ou resposta) e respostas rápidas opcionais.
5. **Pedir e-mail ou telefone** (opcional): veja [Contatos e LGPD](artigo:contatos-e-lgpd).
6. **Etiqueta:** o contato recebe a etiqueta quando a automação dispara.
7. Clique em **Salvar**.

**O que você deve ver:** a automação na lista, marcada **desligada** e **ensaio**.

## Testar antes de ligar

1. No cartão da automação, clique em **Testar**.
2. Escreva um comentário de exemplo e clique em **Testar**.

**O que você deve ver:** cada passo que ela faria (resposta pública, DM, etiqueta) com o texto e os botões. A simulação nunca envia nada para o Instagram.

## Ligar

Só o dono da conta liga. Há três chaves, e as três precisam estar ligadas:

1. a chave do servidor (o suporte liga);
2. a chave do seu cliente, em Admin › Clientes (o suporte liga);
3. o botão **Ligar** de cada automação.

Mesmo ligada, a automação começa em **modo ensaio**: ela recebe os comentários e registra em **Execuções** o que enviaria, sem enviar. Quando estiver tudo certo, clique em **Sair do ensaio** e confirme.

## Regras da Meta que o ContentHub respeita

- A DM a partir de um comentário só pode ser enviada **uma vez por comentário** e **até 7 dias** depois dele. Fonte: [Private replies](https://developers.facebook.com/docs/instagram-platform/private-replies)
- O ContentHub manda no máximo **uma DM por pessoa em cada post**.
- Mensagem comum no direct só sai **até 24 horas** depois da última mensagem da pessoa. Fora disso nada é enviado. Fonte: [Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api)
- A Meta permite 750 DMs de comentário por hora por conta. O ContentHub usa um teto bem menor (60 por hora, mudável pelo suporte até 200). O que passar espera a hora seguinte. Fonte: [limites de taxa](https://developers.facebook.com/docs/instagram-platform/overview)
- Respostas rápidas não aparecem no Instagram do computador, só no celular.
- Quem responder **parar** não recebe mais nada automático.

## Execuções

Na aba **Execuções** fica cada disparo: a palavra, o que foi enviado (ou seria, no ensaio), o que não foi enviado e por quê, e o erro da Meta quando houve. Cliques nos links da DM são contados pelo nosso endereço curto e aparecem no cartão da automação.

> **Ainda não funciona com o público:** a Meta só entrega comentários e mensagens de pessoas de fora depois da análise do app. Veja [App da Meta para automações](artigo:meta-app-automacoes).
