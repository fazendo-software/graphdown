# syntax=docker/dockerfile:1
FROM node:22.13-slim AS build-web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web ./web
COPY core ./core
RUN npm run build:web

FROM node:22.13-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY core ./core
COPY servidor ./servidor
COPY migracoes ./migracoes
COPY categorias ./categorias
COPY --from=build-web /app/web/dist ./web/dist

EXPOSE 5174
# Migração e seed rodam dentro de servidor/index.ts, antes do listen — sequencial é
# suficiente pra v1 de instância única (ver fundacao/auth-deploy sobre múltiplas réplicas).
CMD ["node", "--experimental-strip-types", "servidor/index.ts", "serve"]
