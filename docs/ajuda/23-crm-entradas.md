---
id: crm-entradas
titulo: Por onde o lead entra no CRM
resumo: Automação do direct, anúncio para o direct, formulário da Meta, página de captura com UTMs, planilha e cadastro à mão.
ordem: 23
tags: crm, entrada, automação, captura, formulário, utm, planilha, csv, importar, lead ads, anúncio, ig.me
---
# Por onde o lead entra no CRM

Na aba **Entradas** do CRM ficam as portas. Todas usam a mesma regra contra repetido (e-mail ou telefone) e a mesma regra de consentimento.

## Automação do direct

Em **Automações**, no passo **Enviar para o CRM**, escolha a etapa, o responsável e as etiquetas. Quem dispara a automação vira lead, com a automação e o post como origem. Quem já é lead não volta de etapa: só ganha as etiquetas e o último toque.

O passo vale também no modo ensaio, porque não manda nada para o Instagram. Na simulação (botão **Testar**) ele só aparece como "iria para o CRM".

Os cliques no link da DM entram na linha do tempo do lead. O link leva uma chave sorteada do contato, nunca nome, e-mail ou telefone.

## Anúncio que abre o direct e link ig.me

Quando a pessoa chega no direct por um anúncio (clique para o direct) ou por um link ig.me, a Meta manda junto de onde ela veio. O ContentHub guarda isso como origem do contato (**Anúncio para o direct** ou **Link ig.me**), com o id do anúncio. Se o anúncio já foi sincronizado no **Tráfego**, a campanha e o conjunto entram também.

## Formulário da Meta (Lead Ads)

Quem preenche o formulário de cadastro do anúncio entra sozinho no funil, com campanha, conjunto e anúncio. Precisa de três coisas: a Página cadastrada aqui com o token dela, o app da Meta avisando o ContentHub, e a chave ligada pelo suporte. Passo a passo em [Formulários da Meta no CRM](artigo:meta-lead-ads).

Nos campos do formulário, nome, e-mail e telefone são reconhecidos sozinhos. Pergunta personalizada vira campo do lead. Para mandar uma pergunta para outro lugar, use o mapa de campos da Página (uma linha por campo, por exemplo `qual_o_seu_whatsapp=phone`).

## Página de captura

1. Clique em **Novo formulário**, dê um nome, escolha o que pedir (e-mail, telefone ou os dois), a etapa e o texto de autorização.
2. Clique em **Copiar HTML** e cole na sua página (site, página de vendas, link da bio).
3. Use links com UTM para divulgar, por exemplo `?utm_source=instagram&utm_campaign=outubro`. O formulário guarda as UTMs da página.

A caixinha de autorização é obrigatória. Contra robô: uma ficha que só vale de 2 segundos a 2 horas depois de a página abrir, um campo escondido que só robô preenche e no máximo 5 envios a cada 10 minutos por aparelho.

Se o formulário divulga um post, coloque o id do post: os leads aparecem nesse post no relatório.

## Planilha (CSV)

1. Clique em **Escolher arquivo CSV** (até 2 MB e 5.000 linhas).
2. Confira o destino de cada coluna. O ContentHub adivinha pelo cabeçalho; coluna desconhecida vira campo do lead.
3. Veja a prévia: **novo**, **já existe** (completa o que falta e soma etiquetas), **repetida** no arquivo ou **inválida**.
4. Se essas pessoas autorizaram receber contato, marque e diga de onde vieram. Sem isso, a planilha entra sem e-mail e telefone.
5. Clique em **Importar**.

## Cadastro à mão

Botão **Novo lead** no topo do CRM. Para guardar e-mail ou telefone, marque **A pessoa autorizou** e diga como (por exemplo, "pediu orçamento pelo telefone em 18/10").
