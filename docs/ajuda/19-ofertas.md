---
id: ofertas
titulo: Ofertas (anúncios ativos por página)
resumo: Acompanhar quantos anúncios ativos cada página anunciante tem por dia, com selo, filtros, favoritos e histórico.
ordem: 19
tags: ofertas, tendências, biblioteca de anúncios, anúncios ativos, escalando, favoritos
---
# Ofertas

Em **Concorrentes › Ofertas** você acompanha páginas que anunciam na Meta e vê, dia a dia, quantos anúncios ativos cada uma tem. Página que sobe muito de anúncios costuma estar vendendo bem: é um sinal para pesquisar ângulo, formato e oferta, não para copiar.

1. Clique em **Adicionar oferta**.
2. Informe o nome, o link da oferta e as etiquetas (tipo de página, nicho, produto, língua, países).
3. Escolha **como contar**:
   - **Pela API da Biblioteca**: precisa do id numérico da página do Facebook. A contagem roda sozinha uma vez por dia (e no botão **Contar agora pela API**).
   - **Contagem manual**: para oferta que roda só no Brasil. Abra a Biblioteca, confira o número e clique em **Registrar contagem** no cartão.
4. Salve. O cartão mostra os anúncios ativos, a variação contra ontem e contra 7 dias atrás, o selo e a curva dos últimos 30 dias.

**O que você deve ver:** cartões com o número grande, setas verdes ou vermelhas, o selo (Escalando, Crescendo, Estável, Caindo) e os botões **Oferta**, **Biblioteca** e **Histórico**.

## Onde achar o id da página

Abra a Biblioteca de Anúncios da Meta, procure a página e clique nela. O link fica com `view_all_page_id=` seguido de números: esse é o id. Pode colar o link inteiro no campo, que a tela tira o número sozinha.

## De onde vem o número

- **API oficial**: a contagem usa a API da Biblioteca de Anúncios da Meta (ads_archive), com anúncios ativos e os países da União Europeia. A própria Meta avisa que anúncio que não alcançou a União Europeia só aparece se for sobre temas sociais, eleições ou política.
- **Contagem manual**: o número que alguém da equipe anotou, com quem, quando e de onde veio. Aparece escrito **contagem manual** no cartão e no histórico.
- Se a contagem manual e a da API caírem no mesmo dia, vale a manual.
- Com muitos anúncios a contagem para num teto; aí o número aparece como **≥ N** (pelo menos N).

> **Ainda não disponível pela API:** anúncio comercial que roda só no Brasil. Para esses, a API devolve zero. Use a contagem manual.

> **Nunca fazemos:** ler as páginas públicas da Biblioteca por robô. Os termos da Meta proíbem coleta automatizada sem permissão escrita. O botão **Biblioteca** só abre a busca no seu navegador.

## Selo de temperatura

As regras ficam no botão **Como o selo é calculado**. Padrão:

- **Escalando**: pelo menos 50 anúncios ativos e alta de 30% ou mais em 7 dias.
- **Crescendo**: pelo menos 5 anúncios ativos e alta de 10% ou mais em 7 dias.
- **Caindo**: queda de 15% ou mais em 7 dias.
- **Estável**: o resto, quando há comparação de 7 dias.
- **Sem histórico**: ainda não há contagem de 7 a 10 dias antes. **Parou**: zero anúncios depois de ter tido.

## Buscar, ordenar e filtrar

- Busca por nome, produto ou observação.
- Ordem: mais anúncios, maior alta em 7 dias, mais recentes ou nome.
- Filtros: selo, tipo de página (VSL, página de vendas, quiz), nicho, língua e país.
- O coração favorita a oferta só para você; a lista **Favoritas** junta as suas e as da lista da casa.

## Lista da casa

Quem tem o **módulo Ofertas** ligado vê também a **Lista da casa**: ofertas escolhidas pela equipe do ContentHub, com as **novas hoje** marcadas e o relatório **Mais escaladas do mês** (texto pronto para copiar). Para ligar o módulo, fale com o administrador.

## O que a conta precisa para contar pela API

A contagem usa o token da conta de anúncio conectada em Tráfego (veja [Token da Meta para Tráfego](artigo:token-meta-ads)). Além disso, a pessoa dona do token precisa confirmar identidade e localização em facebook.com/ID e aceitar os termos da API da Biblioteca de Anúncios em facebook.com/ads/library/api. Sem conta de anúncio, quem tem o módulo Ofertas usa o token da casa.
