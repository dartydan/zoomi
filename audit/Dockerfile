FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4310 AUDIT_DATA_DIR=/data
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/types.ts ./src/types.ts
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4310
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/index.ts"]
