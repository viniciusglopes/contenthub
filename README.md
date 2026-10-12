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
- Relatório em texto: `GET /api/instagram/report?tipo=segunda|raiox[&project=<id>]`
- Publicação (base, desligada): `POST /api/instagram/publish` com `{ "postId", "dryRun": true }` só confere o post.

## Testes e demonstração local

```bash
npm test            # vitest (inclui ponta a ponta com banco em memória e Meta simulada)
npm run demo:db     # banco em memória na porta 27117
npm run demo:seed   # 5 clientes de exemplo + administrador (exige IG_MOCK=1, MONGODB_URI local, ADMIN_EMAIL e ADMIN_PASSWORD)
npm run dev         # abrir por http://localhost:3000 (não por 127.0.0.1)
```
