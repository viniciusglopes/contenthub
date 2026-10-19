---
id: rastreamento-vendas
titulo: Vendas da Hotmart e da Kiwify no CRM
resumo: Webhook de venda aprovada, reembolso, chargeback e abandono, ligado ao lead e à campanha.
ordem: 27
tags: vendas, hotmart, kiwify, webhook, hottok, compra aprovada, reembolso, chargeback, carrinho abandonado, roas
---
# Vendas da Hotmart e da Kiwify no CRM

Cada venda que a plataforma avisar entra no CRM: compra aprovada, reembolso, chargeback, aguardando pagamento e carrinho abandonado.

## Configurar no ContentHub

1. No CRM, aba **Rastreamento**, em **Vendas**, clique em **Nova integração**.
2. Escolha **Hotmart** ou **Kiwify**, o projeto (é o pixel que recebe o Purchase) e cole a chave de autenticação da plataforma.
3. Escolha a etapa da compra aprovada (padrão: a etapa de ganho do funil) e, se quiser, a etapa de reembolso.
4. Clique em **Salvar e gerar URL** e copie a URL.

## Hotmart

1. Na Hotmart, abra **Ferramentas**, depois **Webhook** (os nomes podem variar).
2. Cadastre uma configuração nova com a URL copiada, versão **2.0.0**, e marque os eventos de compra (aprovada, completa, reembolsada, chargeback, cancelada, abandono de carrinho).
3. Na aba **Autenticação**, copie o **Hottok** e cole no ContentHub.
4. Use **Enviar teste** e confira a venda de teste na lista do ContentHub.

## Kiwify

1. Na Kiwify, abra **Apps**, depois **Webhooks**, e crie um webhook com a URL copiada.
2. Marque os gatilhos: compra aprovada, compra reembolsada, chargeback, carrinho abandonado (e boleto/pix gerado, se quiser).
3. Copie o **token** do webhook e cole no ContentHub. Toda notificação vem assinada com ele; o ContentHub descarta o que não confere.

## Como a venda acha o lead

Na ordem: o código `src`/`sck` que o script pôs no link do checkout, o e-mail do comprador, o telefone. Comprador que não estava no CRM vira lead (origem **Venda (checkout)**), com o consentimento "compra". Carrinho abandonado só marca quem já é lead (etiqueta `carrinho-abandonado`); de quem não é, nada é guardado.

Venda repetida (a plataforma reenvia) não duplica. Com a chave de rastreamento desligada, a URL responde e não guarda nada.

> **Importante:** a página oficial de webhooks da Hotmart estava fora do ar quando isto foi feito e a da Kiwify não descreve o corpo do aviso. Antes de ligar para um cliente, mande o **teste** de cada plataforma e confira se a venda aparece certa.
