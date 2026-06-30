FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/payment-service/package.json packages/payment-service/package.json
RUN pnpm install --filter @irctc/payment-service... --frozen-lockfile=false

FROM deps AS build
COPY packages/shared packages/shared
COPY packages/payment-service packages/payment-service
RUN pnpm --filter @irctc/shared build
RUN pnpm --filter @irctc/payment-service build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S irctc && adduser -S irctc -G irctc
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/payment-service/dist ./packages/payment-service/dist
COPY --from=build /app/packages/payment-service/package.json ./packages/payment-service/package.json
USER irctc
EXPOSE 4006
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:4006/health/live || exit 1
CMD ["node", "packages/payment-service/dist/main.js"]
