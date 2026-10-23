FROM node:24-bookworm-slim AS frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production API_HOST=0.0.0.0 RECV_HOST=0.0.0.0 DB_PATH=/data/telemetry.db
WORKDIR /app
COPY server/package*.json ./server/
RUN npm ci --omit=dev --prefix server && npm cache clean --force \
    && mkdir -p /data && chown node:node /data
COPY --chown=node:node server/ ./server/
COPY --chown=node:node scripts/ ./scripts/
COPY --chown=node:node package.json ./
COPY --from=frontend --chown=node:node /app/client/dist ./client/dist
USER node
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "scripts/healthcheck.js"]
CMD ["node", "server/index.js"]
