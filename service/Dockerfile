FROM node:26-bookworm-slim
WORKDIR /app
RUN npm install --global pnpm@11.22.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY site/package.json ./site/package.json
COPY packages/catalog-kit/package.json ./packages/catalog-kit/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY packages/catalog-kit ./packages/catalog-kit
COPY scripts/catalog/metadata.mjs ./scripts/catalog/metadata.mjs
COPY service ./service
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=8787 CATALOG_DATA_DIR=/data
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "service/main.mjs"]
