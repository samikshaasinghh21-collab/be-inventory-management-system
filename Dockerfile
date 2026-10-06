FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend ./backend
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["node", "backend/src/server.js"]

