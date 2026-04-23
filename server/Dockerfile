FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy source
COPY . .

# Run as non-root for security
RUN addgroup -S shenmay && adduser -S shenmay -G shenmay && chown -R shenmay:shenmay /app
USER shenmay

EXPOSE 3001

# Run migrations first, then start the server.
# Migrations are idempotent (IF NOT EXISTS) so this is safe on every restart.
CMD ["sh", "-c", "node db/migrate.js && node src/index.js"]
