# Node runs the TypeScript sources directly (type stripping, Node >= 22.18): no build step.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY migrations migrations
COPY src src
ENV NODE_ENV=production
EXPOSE 8000
CMD ["node", "src/server.ts"]
