# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm ci

# Copy sources and build client
COPY . .
RUN npm run client:build

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app

# Runtime env
ENV NODE_ENV=production
ENV PORT=3000

# Copy from build stage
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/package.json /app/package-lock.json ./

# Install prod deps only
RUN npm ci --omit=dev

# Data volume for SQLite
VOLUME ["/data"]

EXPOSE 3000

# Run the application
CMD ["node", "server/api/server.js"]