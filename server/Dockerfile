FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY assets ./assets
RUN mkdir -p /data/uploads
EXPOSE 4000
CMD ["node", "src/index.js"]
