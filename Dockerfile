FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# o banco em memória é só para teste local: não baixar o binário no build
ENV MONGOMS_DISABLE_POSTINSTALL=1
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# Estúdio: ffmpeg (montagem do Reel) e Python + Pillow (motor de arte do carrossel e das camadas do Reel).
# As fontes (SIL OFL) vão junto em /app/estudio/fontes.
RUN apk add --no-cache ffmpeg python3 py3-pillow
COPY --chown=nextjs:nodejs estudio ./estudio
ENV ESTUDIO_DIR=/app/estudio
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Mídia dos posts: pasta do volume persistente (no Coolify: volume montado em /data/media).
# Criada aqui com o dono certo para o volume novo já nascer gravável pelo usuário do app.
RUN mkdir -p /data/media && chown nextjs:nodejs /data/media
ENV MEDIA_DIR=/data/media
VOLUME ["/data/media"]
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
