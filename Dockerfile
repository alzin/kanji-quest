# Production container for the Kanji Quest web frontend (TanStack Start + Nitro).
# The GitHub Pages test build uses `npm run build:pages` instead; this image is
# the server-rendered build that Cloud Run serves at kanji.nipporia.com.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite inlines these at build time, so they must be present before `npm run build`.
ARG VITE_API_URL
ARG VITE_BASE_PATH=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
# Nitro bundles its dependencies, so no node_modules are needed at runtime.
COPY --from=build /app/.output ./.output
USER node
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]
