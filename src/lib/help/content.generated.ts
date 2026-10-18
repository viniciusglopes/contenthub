// GERADO por scripts/build-help.mjs a partir de docs/ajuda/*.md. Não edite aqui: edite o .md.
import type { Article } from "./types";

export const ARTICLES: Article[] = [
  {
    "id": "primeiros-passos",
    "title": "Primeiros passos: configurar as contas",
    "summary": "O que fazer, em ordem, para o projeto funcionar. Mostra o que já está feito.",
    "order": 1,
    "admin": false,
    "tags": [
      "começar",
      "configurar",
      "checklist",
      "contas"
    ],
    "body": "# Primeiros passos\n\nA lista acima mostra o andamento **do projeto escolhido**, lido agora do sistema. Clique em um passo para abrir o artigo dele.\n\n- **feito**: já está pronto.\n- **falta fazer**: ainda precisa de você.\n- **para saber**: não depende de você ou não dá para conferir daqui.\n- **ainda não disponível**: o ContentHub ainda não faz.\n\n## A ordem que recomendamos\n\n1. Deixe o Instagram como **conta profissional** e, se for usar Tráfego, ligue a uma **Página do Facebook**. Veja [Conta profissional e Página](artigo:conta-profissional).\n2. Gere o **token do Instagram** e cole no ContentHub. Veja [Token do Instagram](artigo:token-instagram).\n3. Se for acompanhar anúncios, conecte a **conta de anúncio**. Veja [Token da Meta para Tráfego](artigo:token-meta-ads).\n4. Preencha o **Kit de marca** no Estúdio. Veja [Estúdio](artigo:estudio).\n5. Se quiser que a IA escreva, cadastre uma **chave de IA**. Veja [Chaves de IA e integrações](artigo:chaves-e-integracoes).\n6. Para vídeos, monte a **biblioteca de cenas** e um **padrão de vídeo**. Veja [Reel com cenas](artigo:reel-com-cenas) e [Padrões de vídeo](artigo:padroes-de-video).\n7. Crie, aprove e agende. Veja [Calendário e aprovação](artigo:calendario-e-aprovacao).\n\n> **Publicação automática:** começa desligada em toda conta. Você pode criar, aprovar e agendar normalmente. Veja [Por que a publicação está desligada](artigo:publicacao-desligada)."
  },
  {
    "id": "conta-profissional",
    "title": "Conta profissional do Instagram e Página do Facebook",
    "summary": "Trocar o Instagram para conta profissional e ligar a uma Página do Facebook.",
    "order": 2,
    "admin": false,
    "tags": [
      "instagram",
      "profissional",
      "comercial",
      "criador",
      "página",
      "facebook"
    ],
    "body": "# Conta profissional e Página do Facebook\n\nO ContentHub só lê números de **contas profissionais** do Instagram (tipo **Empresa** ou **Criador de conteúdo**). Conta pessoal não funciona.\n\n> Os nomes dos botões abaixo vêm da Central de Ajuda da Meta e **o nome pode variar** conforme a versão do aplicativo e o idioma.\n\n## Trocar para conta profissional (no aplicativo do Instagram)\n\n1. Toque na sua foto de perfil, no canto de baixo à direita.\n2. Toque no menu e depois em **Configurações e atividade**.\n3. Em **Para profissionais**, toque em **Tipo de conta e ferramentas**.\n4. Toque em **Mudar para conta profissional**.\n5. Escolha uma categoria e confirme.\n6. Escolha **Criador de conteúdo** ou **Empresa** e toque em **Avançar**.\n7. Siga as telas. Pode pular a parte de ligar a Página agora.\n\n**O que você deve ver:** no seu perfil aparece o painel profissional.\n\n> **Atenção:** uma conta privada vira **pública** ao mudar para profissional, e os pedidos para seguir pendentes são aceitos.\n\nFonte oficial: [Central de Ajuda do Instagram](https://www.facebook.com/help/instagram/502981923235522)\n\n## Ligar o Instagram a uma Página do Facebook\n\nSó é preciso para **Tráfego** (anúncios) e para ler o Instagram de **concorrentes**. Para os números do seu próprio Instagram, não precisa.\n\nVocê precisa ter acesso de administrador (ou de tarefas) na Página.\n\n1. No Facebook, clique na sua foto de perfil, no canto de cima à direita.\n2. Clique em **Ver todas as Páginas** e entre na Página.\n3. Clique na foto da Página, no canto de cima à direita.\n4. Clique em **Configurações e privacidade** e depois em **Configurações**.\n5. Em **Permissões**, clique em **Contas vinculadas**.\n6. Clique em **Instagram**, depois em **Conectar conta**, e siga as telas.\n\n**O que você deve ver:** a conta do Instagram aparece como conectada na Página.\n\nFonte oficial: [Central de Ajuda do Facebook](https://www.facebook.com/help/1148909221857370)"
  },
  {
    "id": "token-instagram",
    "title": "Token do Instagram",
    "summary": "Gerar o token da conta e colar no ContentHub para ver números e comentários.",
    "order": 3,
    "admin": false,
    "tags": [
      "instagram",
      "token",
      "meta",
      "app",
      "conectar"
    ],
    "body": "# Token do Instagram\n\nO token é a \"chave\" que deixa o ContentHub ler os números da conta. Ele é gerado no painel de desenvolvedor da Meta, dentro do app da plataforma.\n\n> Quem gera o token precisa ter acesso ao app da Meta da plataforma. Se você é cliente, normalmente o suporte faz este passo com você.\n\n## Gerar o token\n\n1. Abra o painel de apps da Meta em [developers.facebook.com](https://developers.facebook.com/apps) e escolha o app.\n2. No menu da esquerda, clique em **Instagram** e depois em **API setup with Instagram business login** (o nome pode variar).\n3. Ao lado da conta do Instagram, clique em **Generate token** (Gerar token).\n4. Entre com a conta do Instagram (precisa ser profissional) e aceite as permissões.\n5. Copie o token.\n\n**O que você deve ver:** um texto longo que começa com **IG**.\n\nSegundo a documentação oficial, o token gerado no painel **vale 60 dias**. Fonte: [Instagram API com login do Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started.md)\n\n## Colar no ContentHub\n\n1. No menu, clique em **Configurações** e depois em **Redes Sociais**.\n2. Clique em **Conectar Instagram**, escolha o projeto e cole o token no campo **Cole aqui o token (começa com IG...)**.\n3. Salve e depois clique em **Sincronizar agora** na tela Instagram.\n\n**O que você deve ver:** o @ da conta aparece em Instagram e os números chegam em alguns segundos.\n\n## O que este acesso não faz\n\n- Não lê anúncios: para isso existe o [token da Meta para Tráfego](artigo:token-meta-ads).\n- Comentários de pessoas de fora só chegam depois que a Meta aprovar o app (análise do app). Veja [Comentários](artigo:comentarios).\n\n## Tirar o acesso\n\nVeja [Como tirar o acesso de um app](artigo:revogar-acesso)."
  },
  {
    "id": "token-meta-ads",
    "title": "Token da Meta para Tráfego (anúncios)",
    "summary": "Gerar no Explorador da Graph API um token com as permissões de anúncios e colar em Tráfego.",
    "order": 4,
    "admin": false,
    "tags": [
      "tráfego",
      "anúncios",
      "ads",
      "meta",
      "token",
      "graph api",
      "explorer",
      "ads_read"
    ],
    "body": "# Token da Meta para Tráfego\n\nServe para ver campanhas, conjuntos e anúncios em **Tráfego**, e para ler o Instagram de **concorrentes**. O ContentHub só **lê**: pausar, ativar e mudar orçamento ficam desligados.\n\n## Permissões necessárias\n\n- **ads_read**: ler a conta de anúncio.\n- **instagram_basic** e **instagram_manage_insights**: ler o Instagram (concorrentes).\n- **pages_show_list** e **pages_read_engagement**: achar o Instagram ligado à Página.\n\n## Gerar no Explorador da Graph API\n\n1. Abra o [Explorador da Graph API](https://developers.facebook.com/tools/explorer/).\n2. No canto de cima à direita, escolha o app em **Meta App** (aparecem os apps em que você é administrador, desenvolvedor ou testador).\n3. Em **Permissions** (Permissões), adicione as cinco permissões acima.\n4. Clique no botão de gerar o token (na documentação aparece como **Get Access Token**; o nome pode variar) e aceite na janela da Meta.\n5. Copie o token.\n\n**O que você deve ver:** um texto longo que começa com **EAA**. O ícone de informação ao lado do token mostra o app e as permissões dadas.\n\nFonte oficial: [Graph API Explorer](https://developers.facebook.com/docs/graph-api/guides/explorer)\n\n## Quanto tempo o token dura\n\n- O token do Explorador é **de curta duração** (cerca de 1 a 2 horas, segundo a Meta).\n- Um token de **longa duração** dura cerca de **60 dias**. A troca é feita por uma chamada de servidor com a chave secreta do app, por isso **peça ao suporte** para fazer a troca.\n- A Meta avisa que essas durações podem mudar.\n\nFontes oficiais: [Tokens de longa duração](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived) e [Tokens de acesso](https://developers.facebook.com/docs/facebook-login/guides/access-tokens). Para conferir validade e permissões, a Meta tem a [ferramenta de tokens](https://developers.facebook.com/tools/accesstoken).\n\n## Colar no ContentHub\n\n1. No menu, clique em **Tráfego**.\n2. Clique em **Conectar conta de anúncio da Meta**.\n3. Informe a conta (começa com **act_**) e cole o token.\n4. Clique em **Conectar** e depois em **Sincronizar agora**.\n\n**O que você deve ver:** as campanhas dos últimos 90 dias.\n\n## Tirar o acesso\n\nVeja [Como tirar o acesso de um app](artigo:revogar-acesso)."
  },
  {
    "id": "revogar-acesso",
    "title": "Como tirar o acesso de um app",
    "summary": "Remover o acesso do ContentHub (ou de qualquer app) à sua conta do Facebook e Instagram.",
    "order": 5,
    "admin": false,
    "tags": [
      "revogar",
      "remover",
      "acesso",
      "segurança",
      "token"
    ],
    "body": "# Como tirar o acesso de um app\n\nFaça isso se trocar de agência, se um token vazou ou se não quer mais usar o ContentHub. Depois disso o token colado para de funcionar. No ContentHub, desconecte a conta em **Configurações** para apagar o token guardado.\n\n> Os nomes vêm da Central de Ajuda do Facebook e **o nome pode variar**.\n\n## Integrações comerciais (Facebook)\n\n1. Clique na sua foto de perfil e em **Configurações e privacidade**, depois **Configurações**.\n2. Clique em **Integrações comerciais**.\n3. Na aba **Ativas**, ache o app.\n4. Clique em **Remover** e confirme.\n\nFonte: [Central de Ajuda do Facebook](https://www.facebook.com/help/405094243235242)\n\n## Apps e sites (Facebook)\n\n1. Foto de perfil, **Configurações e privacidade**, **Configurações**.\n2. Clique em **Apps e sites**.\n3. Clique em **Remover** ao lado do app e confirme.\n\nFonte: [Central de Ajuda do Facebook](https://www.facebook.com/help/170585223002660)\n\n> O app continua com os dados que você já tinha compartilhado. Para pedir que apaguem, fale com quem mantém o app."
  },
  {
    "id": "youtube",
    "title": "YouTube: chave para concorrentes",
    "summary": "Onde fica a chave do YouTube e como criar uma própria no Google Cloud.",
    "order": 6,
    "admin": false,
    "tags": [
      "youtube",
      "google",
      "chave",
      "api",
      "concorrentes"
    ],
    "body": "# YouTube\n\nO ContentHub usa o YouTube para ler canais públicos de **concorrentes** (inscritos, vídeos e visualizações). Não publica no YouTube.\n\n## Já funciona sem você fazer nada?\n\nSe a plataforma tem a chave da casa, sim. Na lista de [Primeiros passos](artigo:primeiros-passos) o passo YouTube aparece como **feito**.\n\n## Criar uma chave própria (opcional)\n\n1. Abra o [Console de APIs do Google](https://console.cloud.google.com/) e crie ou escolha um projeto.\n2. Ative a **YouTube Data API v3** (em **APIs ativadas**; se não aparecer, procure na **Biblioteca de APIs**).\n3. Vá em **APIs e serviços** e depois **Credenciais**.\n4. Clique em **Criar credenciais** e depois **Chave de API**.\n5. Copie a chave.\n\n**O que você deve ver:** uma chave que começa com **AIza**.\n\nO limite gratuito padrão é de **10.000 unidades por dia**; ler um canal custa poucas unidades. O Google avisa que esses números podem mudar.\n\nFontes oficiais: [Primeiros passos da API do YouTube](https://developers.google.com/youtube/v3/getting-started) e [Criar chave de API](https://support.google.com/googleapi/answer/6158862)\n\n## Onde colar\n\nNo ContentHub: **Configurações**, aba **APIs de Produção**, **Adicionar API**, escolha **YouTube Data API (concorrentes)**, cole a chave e salve. A sua chave passa a valer no lugar da chave da plataforma."
  },
  {
    "id": "tiktok",
    "title": "TikTok: o que funciona hoje",
    "summary": "O que dá e o que ainda não dá para fazer com o TikTok no ContentHub.",
    "order": 7,
    "admin": false,
    "tags": [
      "tiktok",
      "rede",
      "publicar"
    ],
    "body": "# TikTok\n\n## O que funciona hoje\n\n- Cadastrar a conta do TikTok no projeto (Configurações, Redes Sociais), só como registro.\n- Planejar posts para o TikTok no calendário e baixar o vídeo para postar à mão.\n\n## Ainda não disponível\n\n> **Ainda não disponível:** ler números do TikTok e publicar no TikTok pelo ContentHub.\n\nO motivo: a API oficial do TikTok para ler perfil e vídeos (Display API) exige conta de desenvolvedor e aprovação do app. Para publicar (Content Posting API), o app precisa de aprovação e auditoria; antes da auditoria os posts só podem sair como **privados** e para poucas contas por dia.\n\nFontes oficiais: [Display API](https://developers.tiktok.com/doc/display-api-overview), [Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started) e [regras de compartilhamento](https://developers.tiktok.com/doc/content-sharing-guidelines)"
  },
  {
    "id": "pexels",
    "title": "Pexels: cenas gratuitas",
    "summary": "O que é a busca no Pexels, a licença dos vídeos e quem liga.",
    "order": 8,
    "admin": false,
    "tags": [
      "pexels",
      "cenas",
      "vídeo",
      "licença",
      "gratuito"
    ],
    "body": "# Pexels\n\nO Pexels é um banco gratuito de vídeos. Com ele ligado, a **Biblioteca de cenas** ganha uma busca: você importa o vídeo e o ContentHub guarda o link, o autor e a licença junto da cena.\n\n## Quem liga\n\nA chave do Pexels é **da plataforma**: quem cadastra é o administrador. Enquanto não houver chave, a busca aparece desligada e você pode enviar os seus próprios clipes.\n\n## Como conseguir a chave (para o administrador)\n\n1. Crie uma conta gratuita no Pexels.\n2. Abra a [página da API do Pexels](https://www.pexels.com/api/) e peça a chave: ela sai na hora.\n\nO limite gratuito é de **200 pedidos por hora e 20.000 por mês**. O Pexels pede um link visível para o Pexels onde as imagens aparecem e, quando possível, crédito ao autor.\n\nFonte oficial: [Documentação da API do Pexels](https://www.pexels.com/api/documentation/)\n\n## A licença dos vídeos\n\nPela [Licença Pexels](https://www.pexels.com/license/): uso gratuito, crédito opcional, pode editar. **Não pode:** mostrar pessoas identificáveis de forma negativa, vender cópias sem alteração, dar a entender que alguém do vídeo apoia sua marca, redistribuir em outros bancos de imagem."
  },
  {
    "id": "chaves-e-integracoes",
    "title": "Chaves de IA, integrações e teto de gasto",
    "summary": "Onde cadastrar as chaves de IA, como funciona o teto do mês e onde ver o gasto.",
    "order": 9,
    "admin": false,
    "tags": [
      "ia",
      "chave",
      "anthropic",
      "openai",
      "google",
      "custo",
      "teto",
      "integrações"
    ],
    "body": "# Chaves de IA e teto de gasto\n\nSem chave nenhuma o Estúdio já funciona: você escreve o roteiro e o sistema faz a arte e o vídeo. A IA entra para **escrever roteiros**, **narrar** (Reel comum) e **gerar imagem ou vídeo**.\n\n## Cadastrar uma chave\n\n1. No menu, clique em **Estúdio** e depois na aba **Chaves de IA**.\n2. Escolha o serviço, cole a chave e marque para que ela serve (texto, voz, imagem, vídeo).\n3. Clique em **Testar**.\n\n**O que você deve ver:** \"Chave funcionando\". A chave fica guardada criptografada e não volta para a tela.\n\nSe tiver mais de uma chave para a mesma finalidade, a ordem define quem tenta primeiro; se uma falhar, a próxima tenta.\n\n## Teto do mês\n\n- Cada conta tem um **teto mensal** de gasto com IA (padrão de US$ 5). Só o administrador da plataforma muda.\n- Antes de uma geração paga aparece o custo estimado; acima de um valor pequeno, você confirma.\n- Bateu o teto, as gerações com IA param até o mês virar.\n\n## Onde ver o gasto\n\n**Estúdio**, aba **Uso e custos**: cada chamada com serviço, modelo, custo em dólar e em real (cotação do dia).\n\n> O **Reel com cenas** não usa IA paga para a voz: a narração é uma voz neural gratuita. Só o roteiro escrito pela IA é cobrado, se você usar.\n\n## Outras integrações\n\n- [YouTube](artigo:youtube) e [Pexels](artigo:pexels).\n- Instagram: [Token do Instagram](artigo:token-instagram). Anúncios: [Token da Meta para Tráfego](artigo:token-meta-ads)."
  },
  {
    "id": "estudio",
    "title": "Estúdio e Kit de marca",
    "summary": "Kit de marca, carrossel e Reel: o que cada aba do Estúdio faz.",
    "order": 10,
    "admin": false,
    "tags": [
      "estúdio",
      "kit",
      "marca",
      "carrossel",
      "reel"
    ],
    "body": "# Estúdio\n\nO Estúdio cria posts a partir do **Kit de marca** do projeto. Tudo que sai daqui vira **rascunho** no calendário: nada é publicado sem aprovação.\n\n## Kit de marca (faça primeiro)\n\n1. **Estúdio**, aba **Kit de marca**.\n2. Preencha o nome que assina, o @, as cores, a fonte e o setor.\n3. Envie o logo (PNG de preferência).\n4. Clique em **Salvar**.\n\n**O que você deve ver:** a prévia de um slide com as suas cores. Os avisos em amarelo dizem o que falta; os que travam a aprovação aparecem como pendência.\n\n## As abas\n\n- **Carrossel**: roteiro (à mão ou por IA) e arte em 1080 x 1350.\n- **Reel**: vídeo com texto animado e legenda, sobre as suas imagens ou o fundo da marca.\n- **Reel com cenas**: vídeo com cenas reais em movimento e legenda palavra a palavra. Veja [Reel com cenas](artigo:reel-com-cenas).\n- **Padrões de vídeo**: o jeito salvo de fazer os vídeos. Veja [Padrões de vídeo](artigo:padroes-de-video).\n- **Biblioteca de cenas**: os clipes da conta.\n- **Chaves de IA** e **Uso e custos**: veja [Chaves de IA](artigo:chaves-e-integracoes)."
  },
  {
    "id": "reel-com-cenas",
    "title": "Reel com cenas",
    "summary": "Criar vídeos com cenas reais em movimento, voz e legenda palavra a palavra.",
    "order": 11,
    "admin": false,
    "tags": [
      "reel",
      "cenas",
      "vídeo",
      "voz",
      "legenda",
      "biblioteca",
      "licença"
    ],
    "body": "# Reel com cenas\n\nO vídeo junta: cenas reais da sua **Biblioteca de cenas** (com zoom lento e troca a cada 3 a 4 segundos), uma **voz neural**, **legenda palavra a palavra**, um cartão de **gancho** no início e um cartão de **chamada** no fim. A trilha é sintetizada, sem direito autoral.\n\n## Antes: a biblioteca de cenas\n\n1. **Estúdio**, aba **Biblioteca de cenas**.\n2. Em **Enviar um clipe**, escolha a categoria (ex.: mar/praia), a **licença** e a página de origem.\n3. Clique em **Escolher o clipe** e envie um MP4 ou MOV.\n\n**O que você deve ver:** a cena aparece na grade, na vertical, com a licença embaixo.\n\n> Sem licença o clipe não entra. Em gravação própria, diga quem gravou. Envie só o que a marca tem o direito de usar.\n\n## Criar o vídeo\n\n1. **Estúdio**, aba **Reel com cenas**.\n2. Escolha o **Padrão** (ele decide voz, cores, cortes, cenas e trilha).\n3. Escolha como escrever: **Tema**, **Pedido livre** ou **Escrever à mão** (veja abaixo).\n4. Confira os textos, a legenda do post e as hashtags.\n5. Se quiser, mude voz, velocidade, trilha ou categorias em **Ajustes deste vídeo**.\n6. Clique em **Ver duração e tempo antes** e depois em **Gerar o vídeo**.\n\n**O que você deve ver:** o vídeo entra na fila com o tempo previsto (alguns minutos). Pronto, ele vira um **rascunho** no calendário, com os créditos das cenas nas notas.\n\n## Tema, pedido livre ou à mão\n\n- **Tema**: a IA escreve o roteiro seguindo o padrão (precisa de chave de IA).\n- **Pedido livre**: descreva o vídeo, por exemplo \"tom calmo, voz feminina, cenas de mar\". Com IA, o roteiro sai pronto e o que você pediu ajusta o padrão só neste vídeo. **Sem IA**, cada frase que você escreveu vira uma cena e o resto segue o padrão (a tela avisa).\n- **Escrever à mão**: os campos vêm em branco, na quantidade de cenas do padrão.\n\n## Gostou do resultado?\n\nNa lista **Vídeos com cenas**, clique em **Salvar como padrão**: as escolhas daquele vídeo viram um padrão novo.\n\n## Bom saber\n\n- Um vídeo com cenas por vez na plataforma: se houver outro na frente, o seu espera.\n- A voz é um serviço gratuito da Microsoft. Se ele não responder, o vídeo **falha com aviso** (não sai com outra voz). Tente de novo mais tarde."
  },
  {
    "id": "padroes-de-video",
    "title": "Padrões de vídeo",
    "summary": "Salvar o jeito de fazer os vídeos de um projeto: voz, cores, legenda, cortes, cenas e guia da IA.",
    "order": 12,
    "admin": false,
    "tags": [
      "padrão",
      "modelo",
      "vídeo",
      "reel",
      "voz",
      "cores",
      "ia"
    ],
    "body": "# Padrões de vídeo\n\nUm padrão guarda **como** os vídeos do projeto são feitos. Todo vídeo com aquele padrão sai igual no estilo; só muda o texto.\n\n## O que o padrão guarda\n\n- **Voz**: qual voz, velocidade e tom.\n- **Visual**: cores (destaque, legenda, contorno, nome no topo, barra), fontes, legenda (caixa alta, palavras por vez, tamanho) e o cartão do gancho.\n- **Ritmo**: corte de cena a cada X segundos e duração alvo.\n- **Cenas**: categorias da biblioteca com **peso** (peso maior aparece mais).\n- **Trilha**: ligada ou não e o volume.\n- **Roteiro**: estrutura (gancho, pontos e chamada), a linha de baixo da chamada, o **tom**, as **regras** e as **palavras proibidas** para a IA.\n\n## Criar ou editar\n\n1. **Estúdio**, aba **Padrões de vídeo**.\n2. Clique em **Novo: impacto** (forte, caixa alta) ou **Novo: sereno** (serifa, calmo), ou escolha um padrão da lista.\n3. Ajuste o que quiser.\n4. Clique em **Salvar padrão**. Use **Tornar principal** para ele vir marcado no Reel com cenas.\n\n**O que você deve ver:** o padrão na lista da esquerda; o principal tem uma estrela.\n\n> As palavras proibidas valem também para o roteiro escrito à mão: o vídeo não é gerado enquanto uma delas estiver no texto."
  },
  {
    "id": "calendario-e-aprovacao",
    "title": "Calendário, aprovação e agendamento",
    "summary": "Como um post vai de rascunho a agendado, e quem aprova.",
    "order": 13,
    "admin": false,
    "tags": [
      "calendário",
      "aprovação",
      "agendar",
      "rascunho",
      "post"
    ],
    "body": "# Calendário, aprovação e agendamento\n\nTodo post passa por estas etapas: **rascunho**, **aguardando aprovação**, **agendado**, **publicado** (ou falhou / perdeu o horário).\n\n## Criar e mandar para aprovação\n\n1. No calendário, clique em **Novo Post** (ou gere no Estúdio: já nasce rascunho).\n2. Preencha legenda, data e hora e envie a mídia.\n3. Peça aprovação.\n\n## Aprovar\n\n1. No menu, clique em **Aprovações**.\n2. Abra o post, confira e clique em aprovar, ou peça ajuste com um comentário.\n\nSó o **dono da conta** aprova. Editar um post aprovado faz ele voltar para aprovação. Pendências do kit de marca (por exemplo, registro profissional faltando) travam a aprovação.\n\n**O que você deve ver:** o post aprovado aparece como **agendado** no calendário.\n\n> Agendado não quer dizer publicado: com a [publicação automática desligada](artigo:publicacao-desligada), você baixa a mídia e posta à mão no horário."
  },
  {
    "id": "publicacao-desligada",
    "title": "Por que a publicação automática está desligada",
    "summary": "Quem liga a publicação automática e o que é preciso antes.",
    "order": 14,
    "admin": false,
    "tags": [
      "publicar",
      "publicação",
      "automática",
      "desligada",
      "agendador"
    ],
    "body": "# Por que a publicação está desligada\n\nPor segurança, **nenhuma conta nasce com a publicação automática ligada**. Você cria, aprova e agenda normalmente, mas nada sai sozinho para o Instagram.\n\n## Quem liga\n\nSó o **administrador da plataforma**. São duas chaves, e as duas precisam estar ligadas: uma geral, da plataforma, e uma por cliente.\n\n## O que é preciso antes\n\n- Token do Instagram com permissão de publicar.\n- Conta profissional.\n- Um teste combinado com o suporte.\n\nFale com o suporte quando quiser ligar."
  },
  {
    "id": "instagram",
    "title": "Tela Instagram: números e período",
    "summary": "Alcance, visualizações, seguidores e o desempenho de cada post, no período que você escolher.",
    "order": 15,
    "admin": false,
    "tags": [
      "instagram",
      "números",
      "alcance",
      "período",
      "histórico"
    ],
    "body": "# Tela Instagram\n\n1. No menu, clique em **Instagram** e escolha o projeto.\n2. Escolha o período na barra **Período** (7 dias, 30 dias, 90 dias, mês, datas).\n3. Clique em **Sincronizar agora** para trazer o mais recente.\n\n**O que você deve ver:** cartões com alcance, visualizações e seguidores, comparados com o período anterior do mesmo tamanho, e a tabela de posts.\n\n## Dicas\n\n- **Buscar histórico (12 meses)** traz posts antigos na primeira vez.\n- \"Alcance da conta\" soma os dias e pode contar a mesma pessoa mais de uma vez; \"alcance dos posts\" soma só os posts do período.\n- A Meta guarda números diários da conta por até 90 dias e pode atrasar até 48 horas."
  },
  {
    "id": "comentarios",
    "title": "Comentários",
    "summary": "Ver os comentários dos posts, o estudo por tema e o relatório.",
    "order": 16,
    "admin": false,
    "tags": [
      "comentários",
      "instagram",
      "responder",
      "estudo"
    ],
    "body": "# Comentários\n\n1. Em **Instagram**, abra a aba **Comentários**.\n2. Clique em **Buscar comentários**.\n3. Clique em um post para ver os comentários dele.\n\n> **Ainda não disponível para comentários de pessoas de fora:** com o acesso padrão da Meta, só chegam comentários de quem tem função no app. Os de clientes reais chegam depois da análise do app pela Meta. A tela mostra quantos o Instagram informou e quantos liberou.\n\nResponder pelo ContentHub fica **desligado** até o administrador ligar para a conta."
  },
  {
    "id": "trafego",
    "title": "Tráfego (anúncios da Meta)",
    "summary": "Ver campanhas, gasto e resultados dos anúncios, só leitura.",
    "order": 17,
    "admin": false,
    "tags": [
      "tráfego",
      "anúncios",
      "campanhas",
      "meta ads"
    ],
    "body": "# Tráfego\n\n1. Conecte a conta de anúncio: veja [Token da Meta para Tráfego](artigo:token-meta-ads).\n2. Escolha o período e o nível (campanha, conjunto ou anúncio).\n3. Clique em **Sincronizar agora** quando quiser números novos. **Buscar 12 meses** traz o histórico.\n\n**O que você deve ver:** gasto, alcance, cliques, CPM, CPC, CTR e compras por item e por dia.\n\n> **Desligado:** pausar, ativar, mudar orçamento e criar anúncio. A tela só lê.\n\nA tela também sugere posts orgânicos com bom desempenho para virar anúncio."
  },
  {
    "id": "concorrentes",
    "title": "Concorrentes",
    "summary": "Acompanhar Instagram, YouTube, anúncios e produtos de concorrentes.",
    "order": 18,
    "admin": false,
    "tags": [
      "concorrentes",
      "youtube",
      "instagram",
      "biblioteca de anúncios"
    ],
    "body": "# Concorrentes\n\n1. No menu, clique em **Concorrentes** e em **Adicionar concorrente**.\n2. Informe o nome e o que tiver: @ do Instagram, canal do YouTube, Página do Facebook.\n3. Salve e clique em atualizar.\n\n## O que cada fonte precisa\n\n- **YouTube**: a chave do YouTube. Veja [YouTube](artigo:youtube).\n- **Instagram**: uma conta de anúncio conectada em Tráfego, com o Instagram ligado a uma Página. Veja [Token da Meta para Tráfego](artigo:token-meta-ads).\n- **Anúncios**: a tela abre a Biblioteca de Anúncios pública da Meta.\n\n> **Ainda não disponível pela API:** anúncios comerciais de concorrentes no Brasil. A API da Biblioteca de Anúncios só devolve anúncios de fora da União Europeia quando são sobre temas sociais, eleições ou política."
  },
  {
    "id": "admin-clientes",
    "title": "Admin: clientes, convites e chaves",
    "summary": "Criar cliente, convidar o dono, entrar como cliente e ligar ou desligar recursos.",
    "order": 90,
    "admin": true,
    "tags": [
      "admin",
      "clientes",
      "convite",
      "publicação",
      "teto"
    ],
    "body": "# Clientes (administrador)\n\n## Criar cliente\n\n1. No menu, clique em **Clientes** e em **Novo cliente**.\n2. Preencha o nome e salve.\n3. Gere o **link de convite para o dono** e mande para ele. O link vale 7 dias e funciona uma vez.\n\n## Entrar como cliente\n\nUse **entrar como** para ver a tela do cliente. Uma faixa avisa que você está vendo como ele; tudo fica registrado.\n\n## Chaves por cliente (desligadas por padrão)\n\n- **Publicação automática no Instagram**: só funciona se a chave geral da plataforma também estiver ligada.\n- **Responder comentários pelo ContentHub**.\n- **Ações em anúncios** (Tráfego).\n- **Teto de IA do mês** e imagem/vídeo de IA em setor regulado.\n\n## Chaves da casa\n\nYouTube e Pexels da plataforma são cadastrados pela rota de integrações do administrador (`/api/admin/integracoes`, ações `youtube` e `pexels`). As chaves de IA da casa ficam em `/api/admin/estudio`. Nenhuma chave volta para a tela depois de salva."
  }
];
