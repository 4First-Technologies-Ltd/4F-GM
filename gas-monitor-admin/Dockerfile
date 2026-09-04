FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM base AS build
# NEXT_PUBLIC_* is inlined at BUILD time, not read at runtime. Without this
# build-arg the bundle falls back to http://localhost:9000 and the deployed
# admin silently talks to nothing. next.config.js fails the build if it is unset.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3010
ENV PORT=3010
CMD ["node", "server.js"]
