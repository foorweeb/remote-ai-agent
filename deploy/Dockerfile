FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-bookworm-slim
ENV NODE_ENV=production RELAY_HOST=0.0.0.0 RELAY_PORT=3200
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/app ./app
COPY --from=build /app/relay ./relay
COPY --from=build /app/tsconfig.json ./tsconfig.json
USER node
EXPOSE 3200
CMD ["npm","run","relay"]
