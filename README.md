This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## White label: clientes, usuários e isolamento

O ContentHub atende vários clientes. Cada cliente é uma **organização**; projetos, posts,
contas, chaves de API e dados do Instagram pertencem a uma organização e nunca aparecem para outra.

- Papéis: administrador da plataforma (vê todos os clientes e pode "entrar como"), dono (equipe e marca do próprio cliente) e membro.
- Sem cadastro aberto. O administrador cria o cliente em **Clientes** e recebe um link de convite (7 dias, uso único) para o dono; o dono convida a equipe em **Minha conta e equipe**.
- Esqueci a senha: quem administra gera um link de nova senha (botão "Nova senha"). Não há envio de e-mail.
- Marca por cliente: nome exibido, logo e cor. A tela de entrada com a marca é `/login?c=<slug>`.
- Isolamento em duas camadas: toda rota nasce de `route()` (`src/lib/api.ts`), que decide a organização pela sessão; e os modelos recusam qualquer consulta sem organização (`src/lib/tenant.ts`). `tests/isolation.test.ts` percorre todas as rotas e falha se surgir uma sem prova.

### Variáveis

| Variável | Para quê |
|---|---|
| `MONGODB_URI` | banco |
| `AUTH_SECRET` | assina o cookie de sessão e o `state` do login do Instagram (mínimo 16 caracteres; `openssl rand -hex 32`) |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | administrador inicial, criado no primeiro login se ainda não existir (senha: 10+ caracteres, letras e números). Depois de criado, mudar a env não muda a senha |
| `ADMIN_RESET` | `1` = redefine a senha do administrador para `ADMIN_PASSWORD` no próximo login. Tirar em seguida |
| `APP_URL` | endereço público (ex.: `https://contenthub.vinculodigital.com.br`). Usado nos links de convite e no retorno do login do Instagram |
| `CONTENTHUB_ENC_KEY` | chave AES-256-GCM dos segredos (`openssl rand -hex 32`). Perder a chave = recolar os tokens |
| `CRON_TOKEN` | `Authorization: Bearer ...` das rotinas (`/api/instagram/sync` e `/api/instagram/report`), que percorrem todos os clientes ativos |
| `IG_OAUTH_ENABLED` | `true` liga o botão "Conectar com o Instagram". Padrão: desligado (só "colar token"). Ligar só depois da análise do app pela Meta: `docs/meta-analise-do-app.md` |
| `IG_APP_ID` + `IG_APP_SECRET` | ID e chave secreta **do app do Instagram** (não do app da Meta). O segredo também troca token curto por longo |
| `IG_OAUTH_REDIRECT_URI` | opcional; padrão `APP_URL` + `/api/instagram/oauth/callback` |
| `IG_OAUTH_SCOPES` | opcional; padrão `instagram_business_basic,instagram_business_manage_insights` |
| `IG_API_VERSION` | opcional, padrão `v25.0` |
| `IG_PUBLISH_ENABLED` | `true` liga a publicação. Padrão: desligada |
| `IG_MOCK` | `1` = modo demonstração (Meta simulada). Nunca em produção |
| `IG_COMMENT_REPLY_ENABLED` | `true` = chave geral de responder comentário pelo ContentHub (padrão: desligada). Ainda precisa da chave do cliente em Admin › Clientes |
| `TRAFEGO_WRITE_ENABLED` | `true` = chave geral das ações nos anúncios da Meta (pausar, ativar, orçamento diário, criar anúncio pausado). Padrão: desligada. Ainda precisa da chave do cliente em Admin › Clientes |
| `AUTOMACOES_ENABLED` | `true` = chave geral das automações do direct (webhook guarda eventos, motor roda). Padrão: desligada. Ainda precisa da chave do cliente em Admin › Clientes e de cada automação ligada (que nasce em ensaio) |
| `IG_WEBHOOK_VERIFY_TOKEN` | texto sorteado (16+ caracteres) que se cola no painel da Meta em "Verify token" do webhook do Instagram |
| `CRM_LEAD_ADS_ENABLED` | `true` = chave geral dos formulários da Meta (Lead Ads) no CRM: webhook guarda avisos e o laço busca o lead. Padrão: desligada. Ainda precisa da chave do cliente em Admin › Clientes |
| `META_APP_SECRET` | chave secreta do app da Meta (Facebook) que assina o webhook `leadgen` (aceita também `LEAD_ADS_APP_SECRET`). Sem ela o webhook responde 503 |
| `TRACKING_ENABLED` | `true` = chave geral do rastreamento (script do site guarda visitas/leads; webhooks da Hotmart/Kiwify guardam vendas). Padrão: desligada. Ainda precisa de `Organization.trackingEnabled` (Admin › Clientes) |
| `CAPI_ENABLED` | `true` = chave geral da API de Conversões da Meta (Lead/Purchase pelo servidor). Padrão: desligada. Ainda precisa de `Organization.capiEnabled` e do envio ligado no site (pixel + token) |
| `LEAD_ADS_VERIFY_TOKEN` | texto sorteado (16+ caracteres) para o "Verify token" do webhook `leadgen` (objeto Page) |
| `IG_WEBHOOK_SECRET` | opcional: segredo usado para conferir a assinatura `X-Hub-Signature-256` do webhook. Sem ela vale `IG_APP_SECRET` |
| `AUTOMACOES_HOURLY_CAP` | opcional: envios por hora por conta (padrão 60, máximo 200; a Meta permite 750 private replies/h) |
| `META_API_VERSION` | opcional, padrão `v25.0` (Graph API do Facebook: anúncios, Business Discovery, Biblioteca de Anúncios) |

**Tráfego e Concorrentes** (menu): conta de anúncio por projeto com token colado (login do Facebook, `ads_read`), números por anúncio e por dia no período escolhido, candidatos a anúncio pelos posts orgânicos. Concorrentes: Instagram pelo Business Discovery (só existe no host `graph.facebook.com`, usa o token da conta de anúncio com `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`; no `graph.instagram.com` a Meta responde "nonexisting field"), YouTube pela Data API v3 (chave do cliente em Configurações › APIs, serviço `youtube`, ou chave da casa em `PUT /api/admin/integracoes`), anúncios pelo link da Biblioteca pública (a API `ads_archive` só traz comercial que alcançou a UE) e produtos numa tabela à mão. Rotinas opcionais com `CRON_TOKEN`: `POST /api/trafego/sync` e `POST /api/concorrentes/atualizar`.

`APP_PASSWORD` deixou de existir (era a senha única).

### Subir em produção (ordem)

1. **Envs** no Coolify: `AUTH_SECRET`, `CONTENTHUB_ENC_KEY`, `CRON_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `APP_URL`. Apagar `APP_PASSWORD` se existir.
2. **Migração** (com backup antes): ensaio `MONGODB_URI=... npx tsx scripts/migrate-white-label.ts`, conferir os números, depois `--apply --confirmo-producao`. Cria a organização "Vínculo Digital", põe nela tudo que existe, troca os índices únicos antigos e cria o administrador. Idempotente.
3. **Deploy** do código.
4. Rodar a migração **de novo** (pega o que o código antigo gravou entre os passos 2 e 3) e conferir `orphansAfter: 0`. A tela Clientes avisa se sobrar registro sem cliente.

Enquanto a migração não roda, registro sem organização não aparece para ninguém (nem para o administrador).

Reverter: voltar o deploy para a versão anterior. ATENÇÃO: o código anterior não conhece organização (e a `main` de hoje nem login tem); voltar depois que houver mais de um cliente mistura os dados de todos. Reverter só enquanto existir apenas a organização padrão. Os campos e coleções novos (`organization`, `organizations`, `users`, `invites`, `auditlogs`) são ignorados pelo código antigo; os índices únicos antigos (`projects.slug_1`, `apicredentials.service_1`) são recriados sozinhos pelo código antigo, desde que não haja dois clientes com o mesmo slug/serviço.

### Domínio próprio por cliente (fora desta entrega)

Seria preciso: campo `domains` na organização; a tela de entrada e o proxy escolherem a marca pelo `Host`; um rótulo do Traefik/Coolify (e certificado) por domínio, com o CNAME do cliente apontando para a VPS; `APP_URL` e o retorno do login do Instagram por domínio (cada um cadastrado no painel da Meta) ou o retorno sempre pelo domínio principal; cookie de sessão por domínio.

## Instagram (API oficial, login do Instagram)

- Conectar: Configurações > Redes Sociais > Adicionar Conta > Instagram > colar o token (ou "Conectar com o Instagram" quando `IG_OAUTH_ENABLED=true`).
- Métricas: `POST /api/instagram/sync` (com login: contas do cliente; com o token de rotina: todos os clientes; corpo `{ "project" }` ou `{ "account" }` para uma só).
  Cron diário sugerido: `curl -X POST -H "Authorization: Bearer $CRON_TOKEN" https://<host>/api/instagram/sync`
- Histórico: a PRIMEIRA sincronização de uma conta busca até 12 meses de posts (paginando, com teto de 1.000 posts, 1.500 chamadas e 4 minutos por rodada; se a Meta limitar, guarda o que veio e avisa) e até 90 dias de alcance/views da conta (é o que a Meta guarda). As diárias buscam só os posts dos últimos 90 dias. Conta já conectada: botão "Buscar histórico (12 meses)" ou `POST /api/instagram/sync` com `{ "account": "<id>", "historico": true }` (só com login; a rotina nunca busca histórico).
- Período do painel e do relatório (padrão 30 dias; dias de Brasília): `?periodo=7d|30d|90d|mes|mes-passado`, ou `?dias=N` (1 a 366), ou `?de=AAAA-MM-DD&ate=AAAA-MM-DD`. A comparação é sempre com o período anterior do mesmo tamanho; sem dado suficiente o percentual vem `null` ("sem comparação ainda"). Período inválido: 400 com `error` e `field`.
- Painel: `GET /api/instagram/dashboard?project=<id>[&período]`.
- Relatório em texto: `GET /api/instagram/report?tipo=segunda|raiox[&project=<id>]` (atalhos) ou com os parâmetros de período acima (relatório "do período").
- Dois alcances, de propósito: "Alcance da conta" é a SOMA do alcance de cada dia (a mesma pessoa conta de novo a cada dia; inclui stories, anúncios e posts antigos) e "Alcance dos posts do período" soma só os posts publicados no período. Não são comparáveis.
- Publicação (base, desligada): `POST /api/instagram/publish` com `{ "postId", "dryRun": true }` só confere o post.

## Publicar sozinho: mídia, aprovação e agendador

O cliente cria o post **com a mídia**, o dono aprova e o post sobe no Instagram na data e hora marcadas (horário de Brasília).

**Fluxo do post:** rascunho → aguardando aprovação → aprovado/agendado → publicando → publicado | falhou | perdeu o horário.
Só o dono da organização (ou o administrador) aprova; membro pede aprovação; editar um post aprovado devolve para "aguardando aprovação". Aprovação, pedido de ajuste e publicação ficam no `AuditLog` e no histórico do post. A situação só muda por `POST /api/posts/[id]/workflow` (`request`, `approve`, `adjust`, `draft`, `retry`, `mark_posted`); mandar `status` na edição não tem efeito.

**Mídia** (`src/lib/media`): o arquivo é enviado para `POST /api/uploads` (o corpo do pedido é o próprio arquivo), o tipo é conferido pelo conteúdo, imagem (JPG/PNG/WebP) vira JPEG sRGB de até 1440 px e vídeo (MP4/MOV) tem duração, codec, tamanho e quadros lidos do próprio arquivo. Fora do padrão do Instagram vira aviso na tela; proporção fora de 4:5 a 1,91:1 oferece "Recortar" ou "Ajustar com fundo". HEIC ainda não é aceito.
Os arquivos ficam em `MEDIA_DIR` (em produção `/data/media`, **volume persistente**), em `<organização>/<nome sorteado de 192 bits>.<jpg|mp4|mov>`, e são servidos sem login por `GET /api/media/<organização>/<arquivo>` (é o endereço que a Meta baixa; aceita `Range`). Não existe listagem. Apagar o post, ou tirar a mídia do post e salvar, apaga o arquivo. Mídia enviada e não usada some em 24h.
Limites: imagem até 30 MB, vídeo até 300 MB, 10 itens por post, cota de 5 GB por organização (`MEDIA_QUOTA_MB` muda).

**Duas chaves, as duas desligadas por padrão:** `IG_PUBLISH_ENABLED=true` (env, geral) **e** "Publicação automática no Instagram" em Admin › Clientes (por organização, só o administrador da plataforma). Com qualquer uma desligada o post pode ser aprovado e agendado, a tela avisa "Publicação automática desligada para esta conta" e nada sai.

**Agendador** (`src/lib/instagram/scheduler.ts`): `POST /api/instagram/publish-due`, só com `Authorization: Bearer $CRON_TOKEN`. Rodar a cada minuto:

```
* * * * * curl -fsS -m 280 -X POST -H "Authorization: Bearer $CRON_TOKEN" https://SEU-DOMINIO/api/instagram/publish-due
```

- trava atômica por post (nunca publica duas vezes, mesmo com duas rodadas ao mesmo tempo);
- container → espera ficar pronto (reel processa; a rodada seguinte continua) → publica → guarda id e link em `externalIds.instagram` / `externalIds.instagramPermalink`;
- se o processo cair no meio, a próxima rodada pergunta ao Instagram em que pé está o container e retoma sem duplicar;
- lê o limite de publicações de 24h da própria API antes de publicar;
- passou mais de `IG_PUBLISH_TOLERANCE_MIN` (padrão 60) do horário: não publica, marca "perdeu o horário" e pede decisão;
- erro permanente da Meta: falha na hora com a mensagem traduzida; erro temporário: no máximo 2 novas tentativas (2 e 10 minutos depois).

## Testes e demonstração local

```bash
npm test            # vitest (inclui ponta a ponta com banco em memória e Meta simulada)
npm run demo:db     # banco em memória na porta 27117
npm run demo:seed   # 5 clientes de exemplo + administrador (exige IG_MOCK=1, MONGODB_URI local, ADMIN_EMAIL e ADMIN_PASSWORD)
npm run dev         # abrir por http://localhost:3000 (não por 127.0.0.1)
```

## Comentários do Instagram

- **Leitura**: `GET /{mídia}/comments` com as respostas (`replies`), 50 por página. Entra na sincronização normal (posts dos últimos 30 dias) e no botão "Buscar comentários" (um post ou todos os posts do período). Token precisa de `instagram_business_manage_comments`.
- **Acesso padrão da Meta**: enquanto o app não passa pela análise (acesso avançado), a API responde 200 com poucos ou nenhum comentário. O sistema compara com o `comments_count` do post e mostra o aviso "O Instagram informou N comentários, mas só liberou M".
- **O que fica guardado** (`InstagramComment`): @ de quem escreveu, texto, data, curtidas, se é resposta e de qual comentário, se a conta já respondeu, oculto. Nada de id de usuário, foto ou perfil. Some junto ao desconectar a conta; comentário apagado no Instagram sai na busca seguinte.
- **Estudo** (`src/lib/comments/`): classificador com interface única (`classify.ts`), provedor de regras em português (`rules.ts`, "automática simples") e contrato de IA com provedores em sequência e fallback (`llm.ts`; nenhum adaptador HTTP registrado, nada é chamado). Relatório em texto: `GET /api/instagram/report?tipo=comentarios&periodo=30d`.
- **Responder** (`POST /api/instagram/comments/<id>/reply`): só com `IG_COMMENT_REPLY_ENABLED=true` E a chave do cliente ligada pelo administrador; pede confirmação e registra quem respondeu. Ocultar e apagar não existem.

## Automações do direct (comentou PALAVRA, DM, contatos)

- Webhook público `GET|POST /api/instagram/webhook` (fora do login): verificação `hub.challenge` com `IG_WEBHOOK_VERIFY_TOKEN`; cada POST tem a assinatura `X-Hub-Signature-256` conferida no corpo cru; evento guardado por organização, idempotente pela chave (id do comentário, `mid`), e processado depois pelo motor (`src/lib/automations/engine.ts`, laço do servidor + `POST /api/automacoes/worker` com `CRON_TOKEN`).
- Três chaves desligadas: `AUTOMACOES_ENABLED`, `Organization.automationsEnabled` (Admin › Clientes) e `Automation.active`; cada automação nasce em ensaio (`dryRun`), que registra o que enviaria sem chamar a Meta. Simular pela tela (`POST /api/automacoes/simular`) funciona com tudo desligado.
- Regras: private reply 1 por comentário e até 7 dias; 1 DM por pessoa por post; direct só na janela de 24h (sem HUMAN_AGENT); teto por hora por conta; "parar" respeitado; e-mail/telefone só depois do "sim" ao texto de consentimento (guardado com data e versão).
- Link da DM passa por `/api/r/<org>/<código>` (público) para contar o clique.
- Passo a passo da Meta (webhook, verificação da empresa, análise do app): `docs/ajuda/21-meta-app-automacoes.md`.

## CRM de leads

- O lead é o `Contact` (models/Automation.ts) com campos de funil: `lead`, `pipeline`, `stage`, `owner`, `value`, `lostReason`, `wonAt`/`lostAt`, `origin`, `utm`, `firstTouch`/`lastTouch`, `phoneKey` (dedupe), `clickKey` (clique do link da DM na linha do tempo). Lead sem Instagram tem `igsid` sintético `x:<id>`.
- Coleções novas (todas com o plugin de organização): `Pipeline`, `LeadEvent`, `LeadTask`, `ConsentLog`, `LeadCapture`, `CaptureRate`, `LeadAdsPage`, `LeadAdsEvent` (`src/models/Crm.ts`). Lógica em `src/lib/crm/`.
- Entradas: passo "Enviar para o CRM" da automação; `referral` de anúncio/ig.me no direct; formulário da Meta (`/api/crm/lead-ads/webhook`, público e assinado; busca `GET /{leadgen_id}` com o token da Página, só leitura; laço do servidor + `POST /api/crm/lead-ads/processar`); página de captura pública `/api/captura/<org>/<código>` (ficha assinada, isca, teto por IP, consentimento); planilha com prévia (`POST /api/crm/importar`); cadastro à mão.
- E-mail/telefone só com consentimento registrado (`ConsentLog`); dedupe por e-mail e telefone dentro da organização; "Juntar" repetidos.
- Relatório `GET /api/crm/relatorios?agrupar=campanha|conjunto|anuncio|post|origem&toque=primeiro|ultimo` (+ `formato=csv`), custo do Tráfego só quando o id bate (estimativa rotulada).
- Chaves desligadas dos formulários da Meta: `CRM_LEAD_ADS_ENABLED` + `Organization.leadAdsEnabled`. O ContentHub nunca escreve na Meta (instalar o app na Página é com quem administra a Página).

## Rastreamento (script, vendas, API de Conversões)

- Modelos (`src/models/Tracking.ts`, com o plugin de organização): `TrackingSite` (um por projeto: chave pública, domínios, consentimento, pixel + token CAPI criptografado), `TrackVisitor` (TTL 13 meses), `TrackEvent` (TTL 180 dias), `SalesIntegration`, `Sale` (idempotente por provedor + transação + tipo), `CapiLog` (TTL 90 dias, sem valores da pessoa). Lógica em `src/lib/tracking/`.
- Público: `GET /api/t/<chave>/script` (JS primeiro-partido: UTMs, fbclid→fbc, _fbp, gclid, ttclid, primeiro/último toque em cookie, aviso de cookies, decora links de checkout com src/sck/UTMs, `data-ch-lead`), `POST /api/t/<chave>/evento` (sendBeacon), `POST /api/vendas/<hotmart|kiwify>/<chave>` (hottok / HMAC-SHA1 `?signature=`).
- Venda liga ao lead por src/sck > e-mail > telefone (> lead novo, origem "Venda"); aprovada muda a etapa (configurável) e manda Purchase com `event_id` `purchase.<provedor>.<transação>`.
- API de Conversões: `POST /{pixel}/events`, dados com SHA-256 (em, ph, fn, ln, external_id), fbc/fbp/IP/UA sem hash, `test_event_code`; três chaves desligadas (`CAPI_ENABLED`, `Organization.capiEnabled`, `TrackingSite.capi.enabled`).
- Relatório de atribuição: `GET /api/crm/relatorios` agora traz vendas, receita, reembolsos, CPA e ROAS, e agrupa também por automação.
