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
    "body": "# Concorrentes\n\n1. No menu, clique em **Concorrentes** e em **Adicionar concorrente**.\n2. Informe o nome e o que tiver: @ do Instagram, canal do YouTube, Página do Facebook.\n3. Salve e clique em atualizar.\n\n## O que cada fonte precisa\n\n- **YouTube**: a chave do YouTube. Veja [YouTube](artigo:youtube).\n- **Instagram**: uma conta de anúncio conectada em Tráfego, com o Instagram ligado a uma Página. Veja [Token da Meta para Tráfego](artigo:token-meta-ads).\n- **Anúncios**: a tela abre a Biblioteca de Anúncios pública da Meta.\n\n> **Ainda não disponível pela API:** anúncios comerciais de concorrentes no Brasil. A API da Biblioteca de Anúncios só devolve anúncios de fora da União Europeia quando são sobre temas sociais, eleições ou política.\n\n## Ofertas\n\nA aba **Ofertas** acompanha quantos anúncios ativos cada página anunciante tem por dia, com selo de temperatura, filtros, favoritos e histórico. Veja [Ofertas](artigo:ofertas)."
  },
  {
    "id": "automacoes",
    "title": "Automações do direct",
    "summary": "Quem comentar uma palavra recebe resposta pública e DM com link; palavra no direct, botões e teste.",
    "order": 19,
    "admin": false,
    "tags": [
      "automações",
      "manychat",
      "comentário",
      "dm",
      "direct",
      "palavra",
      "gatilho",
      "link",
      "ensaio"
    ],
    "body": "# Automações do direct\n\nExemplo: quem comentar **QUERO** no próximo post recebe uma resposta no comentário e uma DM com o link do material.\n\n## Criar\n\n1. No menu, clique em **Automações** e depois em **Nova automação**.\n2. **Quando:** escolha **Comentou no post** (próximo post, posts escolhidos ou todos) ou **Mandou mensagem no direct**, e escreva as palavras. Acento e maiúscula não fazem diferença.\n3. **Resposta pública:** até 3 textos. Eles são usados em rodízio, porque textos iguais em sequência parecem robô para o Instagram.\n4. **DM:** a mensagem, com até 3 botões (link ou resposta) e respostas rápidas opcionais.\n5. **Pedir e-mail ou telefone** (opcional): veja [Contatos e LGPD](artigo:contatos-e-lgpd).\n6. **Etiqueta:** o contato recebe a etiqueta quando a automação dispara.\n7. **Enviar para o CRM** (opcional): quem disparar vira lead no funil, na etapa e com o responsável que você escolher. Veja [Por onde o lead entra no CRM](artigo:crm-entradas).\n8. Clique em **Salvar**.\n\n**O que você deve ver:** a automação na lista, marcada **desligada** e **ensaio**.\n\n## Testar antes de ligar\n\n1. No cartão da automação, clique em **Testar**.\n2. Escreva um comentário de exemplo e clique em **Testar**.\n\n**O que você deve ver:** cada passo que ela faria (resposta pública, DM, etiqueta) com o texto e os botões. A simulação nunca envia nada para o Instagram.\n\n## Ligar\n\nSó o dono da conta liga. Há três chaves, e as três precisam estar ligadas:\n\n1. a chave do servidor (o suporte liga);\n2. a chave do seu cliente, em Admin › Clientes (o suporte liga);\n3. o botão **Ligar** de cada automação.\n\nMesmo ligada, a automação começa em **modo ensaio**: ela recebe os comentários e registra em **Execuções** o que enviaria, sem enviar. Quando estiver tudo certo, clique em **Sair do ensaio** e confirme.\n\n## Regras da Meta que o ContentHub respeita\n\n- A DM a partir de um comentário só pode ser enviada **uma vez por comentário** e **até 7 dias** depois dele. Fonte: [Private replies](https://developers.facebook.com/docs/instagram-platform/private-replies)\n- O ContentHub manda no máximo **uma DM por pessoa em cada post**.\n- Mensagem comum no direct só sai **até 24 horas** depois da última mensagem da pessoa. Fora disso nada é enviado. Fonte: [Messaging API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api)\n- A Meta permite 750 DMs de comentário por hora por conta. O ContentHub usa um teto bem menor (60 por hora, mudável pelo suporte até 200). O que passar espera a hora seguinte. Fonte: [limites de taxa](https://developers.facebook.com/docs/instagram-platform/overview)\n- Respostas rápidas não aparecem no Instagram do computador, só no celular.\n- Quem responder **parar** não recebe mais nada automático.\n\n## Execuções\n\nNa aba **Execuções** fica cada disparo: a palavra, o que foi enviado (ou seria, no ensaio), o que não foi enviado e por quê, e o erro da Meta quando houve. Cliques nos links da DM são contados pelo nosso endereço curto e aparecem no cartão da automação.\n\n> **Ainda não funciona com o público:** a Meta só entrega comentários e mensagens de pessoas de fora depois da análise do app. Veja [App da Meta para automações](artigo:meta-app-automacoes)."
  },
  {
    "id": "ofertas",
    "title": "Ofertas (anúncios ativos por página)",
    "summary": "Acompanhar quantos anúncios ativos cada página anunciante tem por dia, com selo, filtros, favoritos e histórico.",
    "order": 19,
    "admin": false,
    "tags": [
      "ofertas",
      "tendências",
      "biblioteca de anúncios",
      "anúncios ativos",
      "escalando",
      "favoritos"
    ],
    "body": "# Ofertas\n\nEm **Concorrentes › Ofertas** você acompanha páginas que anunciam na Meta e vê, dia a dia, quantos anúncios ativos cada uma tem. Página que sobe muito de anúncios costuma estar vendendo bem: é um sinal para pesquisar ângulo, formato e oferta, não para copiar.\n\n1. Clique em **Adicionar oferta**.\n2. Informe o nome, o link da oferta e as etiquetas (tipo de página, nicho, produto, língua, países).\n3. Escolha **como contar**:\n   - **Pela API da Biblioteca**: precisa do id numérico da página do Facebook. A contagem roda sozinha uma vez por dia (e no botão **Contar agora pela API**).\n   - **Contagem manual**: para oferta que roda só no Brasil. Abra a Biblioteca, confira o número e clique em **Registrar contagem** no cartão.\n4. Salve. O cartão mostra os anúncios ativos, a variação contra ontem e contra 7 dias atrás, o selo e a curva dos últimos 30 dias.\n\n**O que você deve ver:** cartões com o número grande, setas verdes ou vermelhas, o selo (Escalando, Crescendo, Estável, Caindo) e os botões **Oferta**, **Biblioteca** e **Histórico**.\n\n## Onde achar o id da página\n\nAbra a Biblioteca de Anúncios da Meta, procure a página e clique nela. O link fica com `view_all_page_id=` seguido de números: esse é o id. Pode colar o link inteiro no campo, que a tela tira o número sozinha.\n\n## De onde vem o número\n\n- **API oficial**: a contagem usa a API da Biblioteca de Anúncios da Meta (ads_archive), com anúncios ativos e os países da União Europeia. A própria Meta avisa que anúncio que não alcançou a União Europeia só aparece se for sobre temas sociais, eleições ou política.\n- **Contagem manual**: o número que alguém da equipe anotou, com quem, quando e de onde veio. Aparece escrito **contagem manual** no cartão e no histórico.\n- Se a contagem manual e a da API caírem no mesmo dia, vale a manual.\n- Com muitos anúncios a contagem para num teto; aí o número aparece como **≥ N** (pelo menos N).\n\n> **Ainda não disponível pela API:** anúncio comercial que roda só no Brasil. Para esses, a API devolve zero. Use a contagem manual.\n\n> **Nunca fazemos:** ler as páginas públicas da Biblioteca por robô. Os termos da Meta proíbem coleta automatizada sem permissão escrita. O botão **Biblioteca** só abre a busca no seu navegador.\n\n## Selo de temperatura\n\nAs regras ficam no botão **Como o selo é calculado**. Padrão:\n\n- **Escalando**: pelo menos 50 anúncios ativos e alta de 30% ou mais em 7 dias.\n- **Crescendo**: pelo menos 5 anúncios ativos e alta de 10% ou mais em 7 dias.\n- **Caindo**: queda de 15% ou mais em 7 dias.\n- **Estável**: o resto, quando há comparação de 7 dias.\n- **Sem histórico**: ainda não há contagem de 7 a 10 dias antes. **Parou**: zero anúncios depois de ter tido.\n\n## Buscar, ordenar e filtrar\n\n- Busca por nome, produto ou observação.\n- Ordem: mais anúncios, maior alta em 7 dias, mais recentes ou nome.\n- Filtros: selo, tipo de página (VSL, página de vendas, quiz), nicho, língua e país.\n- O coração favorita a oferta só para você; a lista **Favoritas** junta as suas e as da lista da casa.\n\n## Lista da casa\n\nQuem tem o **módulo Ofertas** ligado vê também a **Lista da casa**: ofertas escolhidas pela equipe do ContentHub, com as **novas hoje** marcadas e o relatório **Mais escaladas do mês** (texto pronto para copiar). Para ligar o módulo, fale com o administrador.\n\n## O que a conta precisa para contar pela API\n\nA contagem usa o token da conta de anúncio conectada em Tráfego (veja [Token da Meta para Tráfego](artigo:token-meta-ads)). Além disso, a pessoa dona do token precisa confirmar identidade e localização em facebook.com/ID e aceitar os termos da API da Biblioteca de Anúncios em facebook.com/ads/library/api. Sem conta de anúncio, quem tem o módulo Ofertas usa o token da casa."
  },
  {
    "id": "contatos-e-lgpd",
    "title": "Contatos e LGPD",
    "summary": "Quem entra na lista, como pedir e-mail ou telefone com consentimento, exportar e excluir a pedido.",
    "order": 20,
    "admin": false,
    "tags": [
      "contatos",
      "lgpd",
      "consentimento",
      "e-mail",
      "telefone",
      "etiqueta",
      "exportar",
      "excluir"
    ],
    "body": "# Contatos e LGPD\n\nUm contato aparece quando uma automação dispara para a pessoa ou quando ela manda mensagem no direct de uma conta com as automações ligadas.\n\n## O que fica guardado\n\n- o @ e o identificador da pessoa nesta conta (é o que a Meta envia);\n- etiquetas e campos que você ou a automação colocaram;\n- quando foi a última mensagem dela (para a regra das 24 horas);\n- e-mail ou telefone, **só se ela autorizou**, com a data e a versão do texto que ela aceitou.\n\n## Pedir e-mail ou telefone\n\n1. Na automação, ligue **Pedir e-mail ou telefone**.\n2. Escreva o **texto de consentimento**: diga quem guarda (o nome da sua empresa) e para quê. Exemplo: \"Para te enviar o material, a Clínica X precisa guardar o seu e-mail e usar só para isso. Você autoriza?\"\n3. Salve.\n\nNa DM aparece o botão **Quero receber**. Ao tocar, a pessoa recebe o seu texto e responde **Sim** ou **Não**. Só depois do **Sim** o ContentHub pergunta o e-mail ou telefone e confere se é válido. Com **Não**, nada é guardado.\n\nSe você mudar o texto, os próximos aceites ficam com uma versão nova; os antigos continuam com o texto que a pessoa viu.\n\n## Lista de contatos\n\n1. No menu, clique em **Contatos**.\n2. Use os filtros no topo: busca, **com e-mail ou telefone** e as etiquetas.\n3. Clique num contato para ver o consentimento, mudar etiquetas e campos.\n4. **Exportar CSV** baixa a lista filtrada.\n\n## Excluir a pedido\n\nSe a pessoa pedir para apagar os dados dela:\n\n1. Abra o contato e clique em **Excluir a pedido (LGPD)** (só o dono da conta vê).\n\n**O que você deve ver:** o contato some da lista e o @ e o texto dele são apagados das execuções.\n\n> Você (o cliente) é quem decide para que usa os contatos; o ContentHub guarda e processa por você. Use os dados só para o que está no texto de consentimento.\n\n## Contatos e CRM\n\nContato que entra no funil vira **lead** e aparece no [CRM](artigo:crm). Lá ficam também os leads que não vieram do Instagram (formulário da Meta, página de captura, planilha, cadastro à mão). Excluir a pedido em qualquer um dos dois lugares apaga a pessoa dos dois."
  },
  {
    "id": "meta-app-automacoes",
    "title": "App da Meta para automações",
    "summary": "Passo a passo do webhook, verificação da empresa e análise do app (permissões de comentário e mensagem).",
    "order": 21,
    "admin": false,
    "tags": [
      "meta",
      "app",
      "webhook",
      "análise",
      "app review",
      "verificação",
      "permissões",
      "instagram_business_manage_messages"
    ],
    "body": "# App da Meta para automações\n\nAs automações dependem do app da Meta da plataforma. Este passo a passo é para quem administra o app (normalmente o suporte). Os nomes dos menus podem variar.\n\n## 1. Permissões\n\nO token da conta precisa destas três permissões:\n\n- **instagram_business_basic**\n- **instagram_business_manage_comments** (ler e responder comentários)\n- **instagram_business_manage_messages** (mandar DM)\n\nGere o token de novo marcando as três (veja [Token do Instagram](artigo:token-instagram)).\n\n## 2. Webhook (o Instagram avisa o ContentHub)\n\n1. Abra o app em [developers.facebook.com](https://developers.facebook.com/apps).\n2. Vá em **Instagram** e depois em **Configure webhooks** (o nome pode variar).\n3. Em **Callback URL**, coloque: `https://contenthub.vinculodigital.com.br/api/instagram/webhook`\n4. Em **Verify token**, coloque o mesmo valor da variável `IG_WEBHOOK_VERIFY_TOKEN` do servidor e clique em **Verify and save**.\n5. Assine os campos **comments**, **messages** e **messaging_postbacks**.\n6. No ContentHub, com as chaves ligadas, o suporte liga o webhook em cada conta (isso chama `POST /me/subscribed_apps` na Meta).\n\nCada aviso da Meta vem assinado com o segredo do app; o ContentHub confere a assinatura e descarta o que não confere. Fonte: [Webhooks do Instagram](https://developers.facebook.com/docs/instagram-platform/webhooks)\n\n**O que você deve ver:** o painel da Meta aceita a URL. No modo de desenvolvimento, só chegam comentários e mensagens de pessoas com função no app (testadores).\n\n## 3. Verificação da empresa\n\nA Meta só dá o acesso avançado para empresa verificada.\n\n1. No painel do app, abra **Configurações do app** e depois **Básico**, e confira qual portfólio empresarial é dono do app.\n2. Na Central de Segurança do portfólio, clique em **Iniciar verificação** e envie os documentos da empresa.\n\nFontes: [Níveis de acesso](https://developers.facebook.com/docs/graph-api/overview/access-levels) e [Verificação da empresa](https://developers.facebook.com/docs/development/release/business-verification)\n\n## 4. Análise do app (App Review)\n\n1. No painel do app, abra **Análise do app** e depois **Permissões e recursos**.\n2. Peça **acesso avançado** para as três permissões acima.\n3. Para cada uma, explique o uso e envie um vídeo (screencast) com a tela em inglês mostrando o fluxo: comentário com a palavra, resposta pública, DM com link, contato na lista.\n4. Faça antes pelo menos uma chamada com sucesso de cada permissão (com uma conta testadora).\n5. Depois de aprovado, coloque o app no modo **Ao vivo** (Live).\n\nFontes: [Análise do app do Instagram](https://developers.facebook.com/docs/instagram-platform/app-review) e [Modos do app](https://developers.facebook.com/docs/development/build-and-test/app-modes)\n\n## 5. Contas de clientes\n\nPara contas que não são da própria empresa dona do app, a Meta pede também a verificação de acesso de provedor de tecnologia (Tech Provider). Fonte: [Access Verification](https://developers.facebook.com/docs/development/release/access-verification)\n\n> **Importante:** o ContentHub não usa a etiqueta HUMAN_AGENT nem manda mensagem fora das 24 horas. Não vender a automação a cliente antes da aprovação da Meta."
  },
  {
    "id": "crm",
    "title": "CRM de leads",
    "summary": "Funil com etapas, quadro de arrastar, lista com filtros, ficha do lead com linha do tempo, tarefas e LGPD.",
    "order": 22,
    "admin": false,
    "tags": [
      "crm",
      "lead",
      "funil",
      "kanban",
      "etapa",
      "tarefa",
      "lembrete",
      "responsável",
      "valor",
      "ganhou",
      "perdeu",
      "duplicado"
    ],
    "body": "# CRM de leads\n\nO CRM junta num lugar só quem demonstrou interesse: quem comentou a palavra da automação, preencheu o formulário do anúncio, mandou mensagem por um anúncio, enviou a página de captura, veio da planilha ou foi cadastrado à mão. Cada pessoa é um **lead**, com a origem dela registrada.\n\n## O funil\n\nO funil começa com as etapas **Novo**, **Em conversa**, **Proposta**, **Ganhou** e **Perdeu**. O dono da conta muda isso na aba **Etapas**: renomeia, muda a ordem, cria etapa nova e diz quais contam como venda (**Ganhou**) e quais como perda (**Perdeu**).\n\nEtapa com lead dentro só sai depois de você dizer para qual etapa os leads vão. O funil padrão não pode ser apagado.\n\n## Quadro e lista\n\n- **Funil**: uma coluna por etapa. Arraste o cartão para mudar de etapa (no celular, abra o lead e troque a etapa no topo). Ao soltar em **Perdeu**, o ContentHub pergunta o motivo.\n- **Lista**: uma linha por lead, com etapa, origem, campanha ou post, responsável, valor e data de entrada.\n\nOs filtros ficam no topo e vão para o link (dá para favoritar): busca por nome, @, e-mail ou telefone, responsável, origem, campanha, etiqueta e período. O botão **CSV** exporta o que está filtrado.\n\n## A ficha do lead\n\nClique no cartão. No topo ficam etapa, responsável e valor. Embaixo:\n\n- **Linha do tempo**: tudo o que aconteceu (entrada, automações, mensagens recebidas, cliques no link da DM, mudanças de etapa, notas). Escreva uma nota no campo de cima.\n- **Tarefas**: lembretes com data. Os seus atrasados aparecem num número vermelho na aba **Tarefas**.\n- **Dados**: nome, telefone, e-mail, etiquetas e campos.\n- **Origem**: o primeiro e o último toque (campanha, anúncio, post, UTMs). Veja [Relatórios do CRM](artigo:crm-relatorios).\n- **LGPD**: o registro de consentimento, exportar e excluir a pedido.\n\n## Cadastro repetido\n\nO ContentHub reconhece a mesma pessoa pelo e-mail ou pelo telefone (com ou sem 55, com ou sem o nono dígito) e atualiza o cadastro que já existe em vez de criar outro. Quando aparece **Parece a mesma pessoa** na ficha, clique em **Juntar**: fica um cadastro só, com a linha do tempo, as tarefas e os consentimentos dos dois. Se um deles é do Instagram, é ele que fica.\n\n## E-mail e telefone\n\nE-mail e telefone só são guardados com consentimento registrado (data, canal e texto). No cadastro à mão, marque **A pessoa autorizou** e diga como. Mais em [Contatos e LGPD](artigo:contatos-e-lgpd).\n\nPara exportar tudo sobre uma pessoa ou excluir a pedido dela, abra a ficha, aba **LGPD** (só o dono da conta). A exclusão apaga o lead, a linha do tempo e as tarefas; fica só o registro de que houve exclusão, sem dado pessoal."
  },
  {
    "id": "crm-entradas",
    "title": "Por onde o lead entra no CRM",
    "summary": "Automação do direct, anúncio para o direct, formulário da Meta, página de captura com UTMs, planilha e cadastro à mão.",
    "order": 23,
    "admin": false,
    "tags": [
      "crm",
      "entrada",
      "automação",
      "captura",
      "formulário",
      "utm",
      "planilha",
      "csv",
      "importar",
      "lead ads",
      "anúncio",
      "ig.me"
    ],
    "body": "# Por onde o lead entra no CRM\n\nNa aba **Entradas** do CRM ficam as portas. Todas usam a mesma regra contra repetido (e-mail ou telefone) e a mesma regra de consentimento.\n\n## Automação do direct\n\nEm **Automações**, no passo **Enviar para o CRM**, escolha a etapa, o responsável e as etiquetas. Quem dispara a automação vira lead, com a automação e o post como origem. Quem já é lead não volta de etapa: só ganha as etiquetas e o último toque.\n\nO passo vale também no modo ensaio, porque não manda nada para o Instagram. Na simulação (botão **Testar**) ele só aparece como \"iria para o CRM\".\n\nOs cliques no link da DM entram na linha do tempo do lead. O link leva uma chave sorteada do contato, nunca nome, e-mail ou telefone.\n\n## Anúncio que abre o direct e link ig.me\n\nQuando a pessoa chega no direct por um anúncio (clique para o direct) ou por um link ig.me, a Meta manda junto de onde ela veio. O ContentHub guarda isso como origem do contato (**Anúncio para o direct** ou **Link ig.me**), com o id do anúncio. Se o anúncio já foi sincronizado no **Tráfego**, a campanha e o conjunto entram também.\n\n## Formulário da Meta (Lead Ads)\n\nQuem preenche o formulário de cadastro do anúncio entra sozinho no funil, com campanha, conjunto e anúncio. Precisa de três coisas: a Página cadastrada aqui com o token dela, o app da Meta avisando o ContentHub, e a chave ligada pelo suporte. Passo a passo em [Formulários da Meta no CRM](artigo:meta-lead-ads).\n\nNos campos do formulário, nome, e-mail e telefone são reconhecidos sozinhos. Pergunta personalizada vira campo do lead. Para mandar uma pergunta para outro lugar, use o mapa de campos da Página (uma linha por campo, por exemplo `qual_o_seu_whatsapp=phone`).\n\n## Página de captura\n\n1. Clique em **Novo formulário**, dê um nome, escolha o que pedir (e-mail, telefone ou os dois), a etapa e o texto de autorização.\n2. Clique em **Copiar HTML** e cole na sua página (site, página de vendas, link da bio).\n3. Use links com UTM para divulgar, por exemplo `?utm_source=instagram&utm_campaign=outubro`. O formulário guarda as UTMs da página.\n\nA caixinha de autorização é obrigatória. Contra robô: uma ficha que só vale de 2 segundos a 2 horas depois de a página abrir, um campo escondido que só robô preenche e no máximo 5 envios a cada 10 minutos por aparelho.\n\nSe o formulário divulga um post, coloque o id do post: os leads aparecem nesse post no relatório.\n\n## Planilha (CSV)\n\n1. Clique em **Escolher arquivo CSV** (até 2 MB e 5.000 linhas).\n2. Confira o destino de cada coluna. O ContentHub adivinha pelo cabeçalho; coluna desconhecida vira campo do lead.\n3. Veja a prévia: **novo**, **já existe** (completa o que falta e soma etiquetas), **repetida** no arquivo ou **inválida**.\n4. Se essas pessoas autorizaram receber contato, marque e diga de onde vieram. Sem isso, a planilha entra sem e-mail e telefone.\n5. Clique em **Importar**.\n\n## Cadastro à mão\n\nBotão **Novo lead** no topo do CRM. Para guardar e-mail ou telefone, marque **A pessoa autorizou** e diga como (por exemplo, \"pediu orçamento pelo telefone em 18/10\")."
  },
  {
    "id": "crm-relatorios",
    "title": "Relatórios do CRM e custo por lead",
    "summary": "Leads e vendas por campanha, conjunto, anúncio, post e origem; custo por lead e por venda com o gasto do Tráfego.",
    "order": 24,
    "admin": false,
    "tags": [
      "crm",
      "relatório",
      "custo por lead",
      "cpl",
      "custo por venda",
      "campanha",
      "anúncio",
      "post",
      "atribuição",
      "primeiro toque",
      "último toque",
      "utm"
    ],
    "body": "# Relatórios do CRM e custo por lead\n\nNa aba **Relatórios** do CRM, escolha o período e como agrupar: **Campanha**, **Conjunto**, **Anúncio**, **Post**, **Automação** ou **Origem**.\n\n## O que cada número quer dizer\n\n- **Leads**: quem entrou no CRM dentro do período.\n- **Ganhos**: desses leads, quantos estão hoje numa etapa de ganho.\n- **Vendas**, **Receita** e **Reemb.**: vendas aprovadas, valor e reembolsos/chargebacks que chegaram pelos webhooks da Hotmart e da Kiwify com data no período. Veja [Vendas da Hotmart e da Kiwify](artigo:rastreamento-vendas).\n- **Gasto**: o que o **Tráfego** registrou no mesmo período para aquele id de campanha, conjunto ou anúncio.\n- **Meta contou**: os leads que a própria Meta informou para aquele id (para comparar com os que chegaram de verdade).\n- **CPL**: gasto dividido por leads. **CPA**: gasto dividido por vendas. **ROAS**: (receita menos reembolsos) dividido pelo gasto.\n\n## Quando aparece custo\n\nO custo só aparece quando o id do lead é o mesmo id do gasto:\n\n- **mesmo id**: o lead veio do formulário da Meta ou de anúncio para o direct, ou da página de captura com `utm_campaign` igual ao id da campanha (a Meta preenche com `{{campaign.id}}`).\n- **estimativa**: ligação indireta. Por post, soma o gasto dos anúncios feitos a partir daquele post. Por UTM com o **nome** da campanha, liga pelo nome.\n- **sem custo**: lead sem id de anúncio (direct orgânico, planilha, cadastro à mão) ou UTM que não bate com nenhuma campanha.\n\nPara o custo funcionar, conecte a conta de anúncio no **Tráfego** e sincronize o período. Veja [Tráfego](artigo:trafego).\n\n## Primeiro e último toque\n\nCada lead guarda o **primeiro toque** (por onde chegou da primeira vez) e o **último toque** (a interação mais recente que trouxe ele de volta). Escolha no seletor qual usar. O primeiro toque mostra o que gera lead novo; o último mostra o que reativa quem já estava na base.\n\n## Exportar\n\nO botão **CSV** baixa a tabela do jeito que está na tela, com a coluna de base do custo."
  },
  {
    "id": "meta-lead-ads",
    "title": "Formulários da Meta no CRM",
    "summary": "Passo a passo para os leads do formulário de cadastro do anúncio entrarem sozinhos no CRM.",
    "order": 25,
    "admin": false,
    "tags": [
      "meta",
      "lead ads",
      "formulário",
      "leadgen",
      "webhook",
      "página",
      "token",
      "leads_retrieval",
      "crm"
    ],
    "body": "# Formulários da Meta no CRM\n\nEste passo a passo liga o formulário de cadastro dos anúncios (Lead Ads) ao CRM. Os nomes dos menus da Meta podem variar.\n\n## Como funciona\n\n1. A pessoa preenche o formulário no anúncio.\n2. A Meta avisa o ContentHub (só o número do lead, sem os dados).\n3. O ContentHub busca o lead na Meta com o token da Página (só leitura) e cria no funil, com campanha, conjunto e anúncio.\n\nFontes: [Webhooks para Lead Ads](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen) e [Como ler os leads](https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving)\n\n## 1. App da Meta (quem administra o app, normalmente o suporte)\n\n1. Abra o app em [developers.facebook.com](https://developers.facebook.com/apps) e adicione o produto **Webhooks**.\n2. Escolha o objeto **Page** e assine o campo **leadgen**.\n3. Em **Callback URL**, coloque o endereço que aparece no CRM, aba **Entradas**, **Formulário da Meta** (termina em `/api/crm/lead-ads/webhook`).\n4. Em **Verify token**, coloque o valor da variável `LEAD_ADS_VERIFY_TOKEN` do servidor e clique em **Verify and save**.\n5. O servidor precisa da chave secreta do app em `META_APP_SECRET`: todo aviso vem assinado e o ContentHub descarta o que não confere.\n\nPermissões que a Meta lista para isso: **leads_retrieval**, **pages_manage_metadata**, **pages_show_list**, **pages_read_engagement** e **ads_management**. O token precisa ser de alguém que pode anunciar pela Página.\n\n## 2. Instalar o app na Página\n\nA Meta só avisa apps instalados na Página. Quem administra a Página faz a instalação (no Graph API Explorer, `POST /{id-da-página}/subscribed_apps` com `subscribed_fields=leadgen` e o token da Página). O ContentHub não faz essa chamada sozinho.\n\n**O que você deve ver:** na ferramenta de teste de leads da Meta, o app aparece como inscrito na Página.\n\n## 3. Cadastrar a Página no CRM\n\n1. No CRM, aba **Entradas**, **Formulário da Meta**, clique em **Cadastrar Página** (só o dono da conta).\n2. Cole o id da Página e o token da Página (com **leads_retrieval**). O ContentHub confere o token com uma leitura e guarda criptografado.\n3. Escolha a etapa, o responsável e as etiquetas dos leads que vierem dela.\n\n## 4. Ligar\n\nO suporte liga a chave **CRM: leads dos formulários da Meta** em Admin, Clientes. Sem ela (e sem a chave geral do servidor), os avisos não são guardados.\n\n## Testar\n\nUse a ferramenta de teste de leads da Meta para criar um lead de teste. Em **Últimos avisos da Meta** aparece a situação: na fila, no CRM ou falhou (com o motivo). Erro passageiro da Meta tenta de novo sozinho; token vencido aparece na Página até você colar um novo.\n\n> **Importante:** o lead do formulário é guardado com o consentimento \"formulário da Meta\" (o formulário mostra a política de privacidade do anunciante). Confira que o seu formulário tem o link da sua política."
  },
  {
    "id": "rastreamento-script",
    "title": "Rastreamento: instalar o script no site",
    "summary": "Script próprio que guarda de onde a pessoa veio (UTM, clique do anúncio), cria o lead do formulário e marca os links do checkout.",
    "order": 26,
    "admin": false,
    "tags": [
      "rastreamento",
      "script",
      "utm",
      "fbclid",
      "fbc",
      "fbp",
      "gclid",
      "ttclid",
      "cookie",
      "consentimento",
      "checkout",
      "src",
      "sck",
      "hotmart",
      "kiwify"
    ],
    "body": "# Rastreamento: instalar o script no site\n\nO script do ContentHub é pequeno e roda no **seu** domínio (cookie primário, sem depender de terceiros). Ele guarda de onde a pessoa veio e leva essa origem até a venda.\n\n## O que ele faz\n\n- Lê as UTMs (`utm_source`, `utm_campaign`...), o clique do anúncio (`fbclid`, que vira o `fbc` da Meta, `gclid`, `ttclid`), a página de entrada e de qual site a pessoa veio.\n- Guarda o **primeiro** e o **último toque** num cookie do seu site por até 13 meses.\n- Manda ao ContentHub as visitas, os leads e os cliques no checkout.\n- Marca os links de checkout (Hotmart, Kiwify, Eduzz, Monetizze, Lastlink, Perfect Pay, Greenn, Ticto) com `src` e `sck` (o código do visitante) e as UTMs. É assim que a venda volta ligada ao lead e à campanha.\n\n## Instalar\n\n1. No CRM, aba **Rastreamento**, escolha o projeto e clique em **Criar script**.\n2. Copie a linha `<script ...>` e cole antes de `</head>` em todas as páginas: site, página de vendas, página de obrigado.\n3. Em **Domínios do site**, coloque os seus domínios (o ContentHub recusa evento de outro lugar).\n4. Clique em **Salvar**.\n\n**O que você deve ver:** ao abrir o site e aceitar os cookies, o contador de eventos do script sobe.\n\n## Formulário vira lead\n\nNo seu formulário, acrescente `data-ch-lead` na tag `<form>` e uma caixinha de autorização com `name=\"ch_consent\"`. Os campos `name`, `email` e `phone` (ou `nome`, `telefone`, `whatsapp`) entram no CRM, com as UTMs do visitante. Sem a caixinha marcada, nada é guardado.\n\nQuem tem formulário próprio pode chamar `chTrack.lead({ name, email, phone, consent: true })` depois do envio.\n\n## Cookies e LGPD\n\nCom **Só rastrear depois do aceite** ligado (padrão), o script não grava cookie nem manda nada até a pessoa aceitar. O aviso de cookies do ContentHub aparece sozinho; se o seu site já tem um, desligue o nosso e chame `chTrack.consent(true)` quando a pessoa aceitar (ou `chTrack.consent(false)` para apagar os cookies).\n\nO que fica guardado: o código do visitante, os toques (UTMs, ids de anúncio, clique), `fbc`/`fbp` e as páginas visitadas (sem a parte da consulta). Eventos somem em 180 dias; o visitante, 13 meses depois da última visita. Excluir o lead a pedido apaga as visitas dele.\n\n## Ids das campanhas\n\nPara o relatório ligar o lead ao gasto, use os parâmetros dinâmicos da Meta nos links do anúncio, por exemplo `utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`. Com o **nome** da campanha, o relatório liga pelo nome e marca como estimativa. Veja [Relatórios do CRM](artigo:crm-relatorios)."
  },
  {
    "id": "rastreamento-vendas",
    "title": "Vendas da Hotmart e da Kiwify no CRM",
    "summary": "Webhook de venda aprovada, reembolso, chargeback e abandono, ligado ao lead e à campanha.",
    "order": 27,
    "admin": false,
    "tags": [
      "vendas",
      "hotmart",
      "kiwify",
      "webhook",
      "hottok",
      "compra aprovada",
      "reembolso",
      "chargeback",
      "carrinho abandonado",
      "roas"
    ],
    "body": "# Vendas da Hotmart e da Kiwify no CRM\n\nCada venda que a plataforma avisar entra no CRM: compra aprovada, reembolso, chargeback, aguardando pagamento e carrinho abandonado.\n\n## Configurar no ContentHub\n\n1. No CRM, aba **Rastreamento**, em **Vendas**, clique em **Nova integração**.\n2. Escolha **Hotmart** ou **Kiwify**, o projeto (é o pixel que recebe o Purchase) e cole a chave de autenticação da plataforma.\n3. Escolha a etapa da compra aprovada (padrão: a etapa de ganho do funil) e, se quiser, a etapa de reembolso.\n4. Clique em **Salvar e gerar URL** e copie a URL.\n\n## Hotmart\n\n1. Na Hotmart, abra **Ferramentas**, depois **Webhook** (os nomes podem variar).\n2. Cadastre uma configuração nova com a URL copiada, versão **2.0.0**, e marque os eventos de compra (aprovada, completa, reembolsada, chargeback, cancelada, abandono de carrinho).\n3. Na aba **Autenticação**, copie o **Hottok** e cole no ContentHub.\n4. Use **Enviar teste** e confira a venda de teste na lista do ContentHub.\n\n## Kiwify\n\n1. Na Kiwify, abra **Apps**, depois **Webhooks**, e crie um webhook com a URL copiada.\n2. Marque os gatilhos: compra aprovada, compra reembolsada, chargeback, carrinho abandonado (e boleto/pix gerado, se quiser).\n3. Copie o **token** do webhook e cole no ContentHub. Toda notificação vem assinada com ele; o ContentHub descarta o que não confere.\n\n## Como a venda acha o lead\n\nNa ordem: o código `src`/`sck` que o script pôs no link do checkout, o e-mail do comprador, o telefone. Comprador que não estava no CRM vira lead (origem **Venda (checkout)**), com o consentimento \"compra\". Carrinho abandonado só marca quem já é lead (etiqueta `carrinho-abandonado`); de quem não é, nada é guardado.\n\nVenda repetida (a plataforma reenvia) não duplica. Com a chave de rastreamento desligada, a URL responde e não guarda nada.\n\n> **Importante:** a página oficial de webhooks da Hotmart estava fora do ar quando isto foi feito e a da Kiwify não descreve o corpo do aviso. Antes de ligar para um cliente, mande o **teste** de cada plataforma e confira se a venda aparece certa."
  },
  {
    "id": "rastreamento-capi",
    "title": "Pixel e API de Conversões da Meta",
    "summary": "Mandar Lead e Purchase pelo servidor, com deduplicação do pixel e dados protegidos por hash.",
    "order": 28,
    "admin": false,
    "tags": [
      "pixel",
      "api de conversões",
      "capi",
      "conversions api",
      "lead",
      "purchase",
      "initiatecheckout",
      "event_id",
      "deduplicação",
      "hash",
      "test_event_code"
    ],
    "body": "# Pixel e API de Conversões da Meta\n\nAlém do pixel no navegador, o ContentHub manda os eventos **Lead** e **Purchase** (e, se quiser, **InitiateCheckout**) direto do servidor para a Meta. Isso recupera conversões que o navegador perde (bloqueador, iPhone, aba fechada).\n\n## Configurar\n\n1. No Gerenciador de Eventos da Meta, abra o pixel, vá em **Configurações** e gere o **token de acesso** da API de Conversões.\n2. No CRM, aba **Rastreamento**, no script do projeto, preencha o **Id do pixel** e cole o **token** (fica criptografado).\n3. Marque **Enviar Lead e Purchase para a Meta** e clique em **Salvar**.\n4. O suporte liga a chave **API de Conversões** da sua conta em Admin, Clientes.\n\n## Deduplicação com o pixel\n\nSe o pixel da Meta está na página, o script dispara o mesmo evento no navegador com o **mesmo eventID** que o servidor manda como `event_id`. A Meta junta os dois e conta uma vez só (dentro de 48 horas). Fonte: [Deduplicação](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)\n\n## O que vai para a Meta\n\n- E-mail, telefone (com 55), nome, sobrenome e o código do lead vão **com hash SHA-256**, nunca em texto.\n- `fbc`, `fbp`, IP e navegador vão sem hash, como a Meta pede.\n- Só vai quem deu consentimento (aceite de cookies e caixinha do formulário) ou quem comprou.\n\nFonte: [Parâmetros de informação do cliente](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)\n\n## Registro\n\nEm **Envios para a Meta** aparece cada evento: enviado, teste, falhou (com a resposta da Meta) ou não enviado (com o motivo, por exemplo chave desligada). O registro mostra quais dados foram, nunca os valores, e some em 90 dias. Veja também [Testar os eventos](artigo:rastreamento-testar)."
  },
  {
    "id": "rastreamento-testar",
    "title": "Testar o rastreamento e os eventos",
    "summary": "Conferir script, lead, link do checkout, venda de teste e evento de teste na Meta antes de ligar para valer.",
    "order": 29,
    "admin": false,
    "tags": [
      "testar",
      "test_event_code",
      "teste",
      "rastreamento",
      "pixel",
      "eventos",
      "hotmart",
      "kiwify"
    ],
    "body": "# Testar o rastreamento e os eventos\n\nFaça nesta ordem, com as chaves ligadas só na sua conta.\n\n## 1. Script\n\nAbra o site com `?utm_source=teste&utm_campaign=teste` no fim do endereço, aceite os cookies e confira na aba **Rastreamento** que o contador de eventos subiu.\n\n## 2. Lead\n\nPreencha o formulário (com a caixinha marcada). O lead aparece no funil com a origem **Página de captura** e as UTMs na aba **Origem** da ficha.\n\n## 3. Link do checkout\n\nPasse o mouse no botão de compra: o endereço deve ter `src=` e `sck=` no fim.\n\n## 4. Venda de teste\n\nUse o envio de teste da Hotmart ou da Kiwify. A venda aparece em **Vendas**, com o lead (se achou) e a origem.\n\n## 5. Meta\n\n1. No Gerenciador de Eventos, abra **Testar eventos** e copie o código (ex.: `TEST12345`).\n2. Cole em **Código de teste** no script do projeto e salve.\n3. Clique em **Enviar evento de teste**. O evento aparece em **Testar eventos** da Meta e em **Envios para a Meta** como \"teste\".\n4. **Apague o código de teste** depois: enquanto ele estiver preenchido, todos os eventos vão como teste e não contam para os anúncios.\n\nFonte: [API de Conversões](https://developers.facebook.com/docs/marketing-api/conversions-api)"
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
  },
  {
    "id": "admin-ofertas",
    "title": "Admin: módulo Ofertas e lista da casa",
    "summary": "Ligar o módulo por cliente, cuidar da lista da casa, do token da Biblioteca, dos países e das regras do selo.",
    "order": 91,
    "admin": true,
    "tags": [
      "admin",
      "ofertas",
      "lista da casa",
      "biblioteca de anúncios",
      "token",
      "selo"
    ],
    "body": "# Módulo Ofertas (administrador)\n\n## Ligar para um cliente\n\n1. Em **Clientes**, abra o cliente.\n2. Marque **Módulo Ofertas (lista da casa)** e salve.\n\n**O que você deve ver:** o cliente passa a ter a lista **Lista da casa** em Concorrentes › Ofertas, o contador de novas do dia e o relatório mensal. Desligado é o padrão.\n\n## Cuidar da lista da casa\n\n1. Em **Concorrentes › Ofertas › Lista da casa**, clique em **Adicionar à lista da casa**.\n2. Preencha como uma oferta comum. Oferta adicionada hoje aparece como **nova hoje** para os clientes.\n3. Para tirar, use a lixeira: a oferta é **arquivada** (some para os clientes, o histórico fica e dá para voltar editando).\n\n## Token da Biblioteca de Anúncios (da casa)\n\n1. Clique em **Configurar módulo**.\n2. Cole o token de usuário de um app da Meta e clique em **Salvar token**, depois em **Testar**.\n\nAntes, a pessoa dona do token precisa:\n\n- confirmar identidade e localização em facebook.com/ID (a Meta leva alguns dias);\n- aceitar os termos da API em facebook.com/ads/library/api.\n\nA página de referência da Meta (developers.facebook.com/docs/graph-api/reference/ads_archive) não fala em análise do app para essa API; isso ainda não foi conferido com um token de verdade. Token de curta duração vence em horas: gere um de longa duração.\n\n## Países e regras do selo\n\n- **Países**: padrão, os 27 da União Europeia. A env `OFFERS_AD_COUNTRIES` (ex.: `PT,ES,FR`) manda mais que a tela.\n- **Regras do selo**: lista em ordem; a primeira que bate vale. Campos: minCount, maxCount, minDelta7, maxDelta7, minDelta7Pct, maxDelta7Pct e tone. **Voltar ao padrão** desfaz.\n\n## Rotina diária\n\n`POST /api/ofertas/atualizar` com `Authorization: Bearer CRON_TOKEN` conta, uma vez por dia, as ofertas de contagem pela API de todos os clientes ativos e da lista da casa. Rodar duas vezes no mesmo dia só atualiza a foto do dia; contagem manual do dia não é sobrescrita."
  }
];
