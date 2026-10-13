# Regras de publicidade em odontologia (CFO)

Pesquisado em 12/10/2026. Vira o bloco `regras_setor` do kit de marca (`kits/drwaldir.json`).

## Resumo (o que o gerador aplica)

1. A norma de base é o Código de Ética Odontológica (Resolução CFO 118/2012, arts. 41 a 45). Publicidade é permitida em qualquer meio, desde que siga o Código (art. 42).
2. Toda peça precisa trazer o nome, a profissão (cirurgião-dentista) e o número de inscrição no CRO; clínica informa também o responsável técnico (art. 43). Especialidade só pode ser citada se estiver registrada no Conselho (art. 43, §1º e art. 44, II).
3. É infração fazer publicidade enganosa ou abusiva, "inclusive com expressões ou imagens de antes e depois, com preços, serviços gratuitos, modalidades de pagamento" ou outras formas de comercialização da Odontologia (art. 44, I).
4. O dentista não pode dar consulta, diagnóstico ou prescrição por veículo de massa, e a participação dele deve ter "caráter exclusivo de esclarecimento e educação da coletividade" (art. 44, V). Por isso o gerador só produz conteúdo informativo e manda para a avaliação presencial.
5. É infração criticar técnicas de outros profissionais, divulgar técnica sem comprovação científica, aliciar pacientes com anúncio irregular e usar a expressão "popular" (art. 44, III, IV e VII).
6. A Resolução CFO 196/2019 abriu uma exceção para imagens: selfie com paciente e imagens de diagnóstico e de conclusão do tratamento, só pelo dentista que executou o caso, com termo de consentimento (TCLE), com nome e CRO na publicação, e nunca caso de terceiros. Seguem proibidos: imagens do procedimento em andamento, imagens que identifiquem equipamentos, instrumentais, materiais e tecidos biológicos, e expressões de sensacionalismo, autopromoção, concorrência desleal, mercantilização ou promessa de resultado (arts. 1º a 5º).
7. A Resolução CFO 271/2025 (DOU de 24/06/2025), feita para cumprir decisão do CADE, mexeu só em pontos comerciais: art. 20, VIII e X (brindes, sorteios, vale presente), revogou o art. 32, XIII (cartão de desconto) e reescreveu o art. 44, XIV (aliciamento por telemarketing ativo, caixas de som, plaqueteiros).
8. Decisão nossa, mais conservadora que a norma: o gerador não usa foto de pessoa, não usa antes e depois nem com TCLE, não cita preço, desconto, brinde ou sorteio, não usa superlativo ("o melhor", "referência") e não promete resultado nem prazo. Esses termos são barrados por `termos_vetados` antes de a arte ser gerada.

## Fontes

- Código de Ética Odontológica, Resolução CFO 118/2012, texto dos arts. 41 a 45 lido em https://www.normaslegais.com.br/legislacao/resolucao-cfo-118-2012.htm (cópia de terceiro, não é o site do CFO).
- Resolução CFO 196/2019, texto integral (DOU nº 22, 31/01/2019, Seção 1, p. 91) lido no PDF https://abmes.org.br/arquivos/legislacoes/Resolucao-CFO-196-2019-01-29.pdf; ficha em https://abmes.org.br/legislacoes/detalhe/2688/resolucao-cfo-n-196
- Resolução CFO 271/2025: https://www.legisweb.com.br/legislacao/?id=479955 e https://legismap.com.br/conteudos/artigos-e-noticias/em-cumprimento-a-decisao-do-cade-cfo-realiza-alteracoes-pontuais-no-codigo-de-etica (ato oficial: https://sistemas.cfo.org.br/visualizar/atos/RESOLU%C3%87%C3%83O/SEC/2025/271, não aberto por nós).
- Nota Técnica 14/2025 do CADE, inquérito 08700.008995/2023-76: https://website.cfo.org.br/wp-content/uploads/2025/03/Nota-Tecnica-no-14-2025-CADE-CFO.pdf (citada pela busca, não lida por inteiro).

## O que NÃO conseguimos confirmar

- Não lemos nenhum texto no site oficial do CFO: o link direto da 196/2019 no site do CFO deu 404, e o texto consolidado do Código com as mudanças de 2025 não foi localizado. O texto do art. 44 acima é o de 2012; a redação nova do inciso XIV só foi vista em resumo.
- Se a 196/2019 segue em vigor sem alteração em 10/2026: a ficha da ABMES diz que não foi alterada nem revogada, mas pode estar desatualizada.
- Se o art. 44, I (preço e forma de pagamento) continua valendo depois do CADE. As fontes divergem: o resumo da legismap diz que propaganda com preço e serviço gratuito seguem vedados; um trabalho acadêmico citado na busca diz que a divulgação de desconto e pagamento passou a ser permitida. Há mandado de segurança sem desfecho conhecido. Tratamos como proibido.
- A notícia de "revisão integral do Código em andamento" (legismap) e qualquer resolução de publicidade posterior a 06/2025: não achamos, o que não prova que não exista.
- Não é parecer jurídico. Antes do primeiro post real, o Dr. Waldir (ou o CRO da UF dele) precisa validar estas regras.
