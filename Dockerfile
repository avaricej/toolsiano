FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ARG PUBLIC_EN_ORIGIN=https://toolsiano.com
ARG PUBLIC_RU_ORIGIN=https://toolsiano.ru
ENV PUBLIC_EN_ORIGIN=$PUBLIC_EN_ORIGIN PUBLIC_RU_ORIGIN=$PUBLIC_RU_ORIGIN
RUN npm run check && npm test && npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 80 443 443/udp
