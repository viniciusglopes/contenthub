---
id: rastreamento-testar
titulo: Testar o rastreamento e os eventos
resumo: Conferir script, lead, link do checkout, venda de teste e evento de teste na Meta antes de ligar para valer.
ordem: 29
tags: testar, test_event_code, teste, rastreamento, pixel, eventos, hotmart, kiwify
---
# Testar o rastreamento e os eventos

Faça nesta ordem, com as chaves ligadas só na sua conta.

## 1. Script

Abra o site com `?utm_source=teste&utm_campaign=teste` no fim do endereço, aceite os cookies e confira na aba **Rastreamento** que o contador de eventos subiu.

## 2. Lead

Preencha o formulário (com a caixinha marcada). O lead aparece no funil com a origem **Página de captura** e as UTMs na aba **Origem** da ficha.

## 3. Link do checkout

Passe o mouse no botão de compra: o endereço deve ter `src=` e `sck=` no fim.

## 4. Venda de teste

Use o envio de teste da Hotmart ou da Kiwify. A venda aparece em **Vendas**, com o lead (se achou) e a origem.

## 5. Meta

1. No Gerenciador de Eventos, abra **Testar eventos** e copie o código (ex.: `TEST12345`).
2. Cole em **Código de teste** no script do projeto e salve.
3. Clique em **Enviar evento de teste**. O evento aparece em **Testar eventos** da Meta e em **Envios para a Meta** como "teste".
4. **Apague o código de teste** depois: enquanto ele estiver preenchido, todos os eventos vão como teste e não contam para os anúncios.

Fonte: [API de Conversões](https://developers.facebook.com/docs/marketing-api/conversions-api)
