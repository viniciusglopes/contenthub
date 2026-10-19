---
id: rastreamento-capi
titulo: Pixel e API de Conversões da Meta
resumo: Mandar Lead e Purchase pelo servidor, com deduplicação do pixel e dados protegidos por hash.
ordem: 28
tags: pixel, api de conversões, capi, conversions api, lead, purchase, initiatecheckout, event_id, deduplicação, hash, test_event_code
---
# Pixel e API de Conversões da Meta

Além do pixel no navegador, o ContentHub manda os eventos **Lead** e **Purchase** (e, se quiser, **InitiateCheckout**) direto do servidor para a Meta. Isso recupera conversões que o navegador perde (bloqueador, iPhone, aba fechada).

## Configurar

1. No Gerenciador de Eventos da Meta, abra o pixel, vá em **Configurações** e gere o **token de acesso** da API de Conversões.
2. No CRM, aba **Rastreamento**, no script do projeto, preencha o **Id do pixel** e cole o **token** (fica criptografado).
3. Marque **Enviar Lead e Purchase para a Meta** e clique em **Salvar**.
4. O suporte liga a chave **API de Conversões** da sua conta em Admin, Clientes.

## Deduplicação com o pixel

Se o pixel da Meta está na página, o script dispara o mesmo evento no navegador com o **mesmo eventID** que o servidor manda como `event_id`. A Meta junta os dois e conta uma vez só (dentro de 48 horas). Fonte: [Deduplicação](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)

## O que vai para a Meta

- E-mail, telefone (com 55), nome, sobrenome e o código do lead vão **com hash SHA-256**, nunca em texto.
- `fbc`, `fbp`, IP e navegador vão sem hash, como a Meta pede.
- Só vai quem deu consentimento (aceite de cookies e caixinha do formulário) ou quem comprou.

Fonte: [Parâmetros de informação do cliente](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)

## Registro

Em **Envios para a Meta** aparece cada evento: enviado, teste, falhou (com a resposta da Meta) ou não enviado (com o motivo, por exemplo chave desligada). O registro mostra quais dados foram, nunca os valores, e some em 90 dias. Veja também [Testar os eventos](artigo:rastreamento-testar).
