#!/bin/bash
# ============================================================
# Nomii AI — Database Setup Script
# Runs migrations and seeds inside the Docker environment
# ============================================================

set -e

echo ""
echo "🧠 Nomii AI — Database Setup"
echo "=============================="
echo ""

# Wait for database to be ready
echo "Waiting for PostgreSQL..."
until docker compose exec db pg_isready -U knomi -d knomi_ai > /dev/null 2>&1; do
  sleep 1
done
echo "✓ PostgreSQL is ready"
echo ""

# Run migrations
echo "Running migrations..."
docker compose exec backend node db/migrate.js
echo ""

# Run seeds
echo "Running seed data..."
docker compose exec backend node db/seed.js
echo ""

# Seed auth passwords for demo users
echo "Setting up demo auth users..."
docker compose exec backend node db/seed-auth.js
echo ""

echo "=============================="
echo "✓ Database setup complete!"
echo ""
echo "Demo Login Credentials:"
echo "  Customer: margaret.chen@email.com / demo123"
echo "  Advisor:  james.rodriguez@covenanttrust.com / demo123"
echo "  Admin:    michael.torres@covenanttrust.com / demo123"
echo ""
echo "Open http://localhost in your browser to start."
echo ""
