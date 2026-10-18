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
# Reel com cenas: numpy (escurecimento do fundo) e edge-tts FIXO em 7.3.1 (a 7.2.8 levou 403 da
# Microsoft em 18/10/2026), instalado só para o motor em /app/estudio/pylib (cenas.py acrescenta ao path).
RUN apk add --no-cache ffmpeg python3 py3-pillow py3-numpy py3-pip \
 && pip install --no-cache-dir --break-system-packages --target /app/estudio/pylib edge-tts==7.3.1 \
 && apk del py3-pip \
 && python3 -c "import sys; sys.path.insert(0, '/app/estudio/pylib'); import edge_tts, numpy; print('edge-tts', edge_tts.__version__)"
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
