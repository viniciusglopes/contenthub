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

## Acesso e segredos

O app inteiro exige login (uma senha) e as chaves/tokens ficam criptografados no banco.
Sem estas variáveis o app não abre e não guarda segredo nenhum:

| Variável | Para quê |
|---|---|
| `APP_PASSWORD` | senha de entrada |
| `AUTH_SECRET` | assina o cookie de sessão (mínimo 16 caracteres; `openssl rand -hex 32`) |
| `CONTENTHUB_ENC_KEY` | chave AES-256-GCM dos segredos (`openssl rand -hex 32`). Perder a chave = recolar os tokens |
| `CRON_TOKEN` | `Authorization: Bearer ...` das rotinas (`/api/instagram/sync` e `/api/instagram/report`) |
| `IG_APP_SECRET` | opcional: segredo do app do Instagram, só para trocar token curto (1h) por longo |
| `IG_API_VERSION` | opcional, padrão `v25.0` |
| `IG_PUBLISH_ENABLED` | `true` liga a publicação. Padrão: desligada |
| `IG_MOCK` | `1` = modo demonstração (Meta simulada). Nunca em produção |

## Instagram (API oficial, login do Instagram)

- Conectar: Configurações > Redes Sociais > Adicionar Conta > Instagram > colar o token.
- Métricas: `POST /api/instagram/sync` (todas as contas; corpo `{ "project" }` ou `{ "account" }` para uma só).
  Cron diário sugerido: `curl -X POST -H "Authorization: Bearer $CRON_TOKEN" https://<host>/api/instagram/sync`
- Relatório em texto: `GET /api/instagram/report?tipo=segunda|raiox[&project=<id>]`
- Publicação (base, desligada): `POST /api/instagram/publish` com `{ "postId", "dryRun": true }` só confere o post.

## Testes e demonstração local

```bash
npm test            # vitest (inclui ponta a ponta com banco em memória e Meta simulada)
npm run demo:db     # banco em memória na porta 27117
npm run demo:seed   # dados de exemplo (exige IG_MOCK=1 e MONGODB_URI local)
npm run dev         # abrir por http://localhost:3000 (não por 127.0.0.1)
```
