# =============================================================================
# Gudy Money — Makefile
# Uso: make <comando>
# =============================================================================

.PHONY: help install dev dev-api dev-web build test migrate seed \
        docker-up docker-down docker-logs docker-build \
        docker-prod-up docker-prod-down clean

# ---------------------------------------------------------------------------
# Ajuda
# ---------------------------------------------------------------------------
help:
	@echo ""
	@echo "Gudy Money — comandos disponíveis:"
	@echo ""
	@echo "  DESENVOLVIMENTO LOCAL"
	@echo "  make install        Instala todas as dependências"
	@echo "  make migrate        Roda migrations do Prisma no banco local"
	@echo "  make dev            Sobe API + Web em paralelo (hot-reload)"
	@echo "  make dev-api        Sobe apenas a API"
	@echo "  make dev-web        Sobe apenas o Web"
	@echo "  make test           Roda todos os testes da API"
	@echo ""
	@echo "  DOCKER DEV (postgres em container, apps local)"
	@echo "  make docker-db      Sobe apenas o PostgreSQL no Docker"
	@echo "  make docker-up      Sobe toda a stack no Docker (API + Web + DB)"
	@echo "  make docker-down    Para e remove os containers"
	@echo "  make docker-logs    Exibe logs de todos os containers"
	@echo ""
	@echo "  PRODUÇÃO"
	@echo "  make docker-prod-up     Sobe stack de produção"
	@echo "  make docker-prod-down   Para stack de produção"
	@echo ""
	@echo "  OUTROS"
	@echo "  make build          Build de todos os pacotes"
	@echo "  make clean          Remove node_modules e builds"
	@echo ""

# ---------------------------------------------------------------------------
# Desenvolvimento local
# ---------------------------------------------------------------------------
install:
	pnpm install

migrate:
	cd apps/api && npx prisma migrate deploy
	cd apps/api && npx prisma generate

dev:
	pnpm dev

dev-api:
	cd apps/api && pnpm dev

dev-web:
	cd apps/web && pnpm dev

build:
	pnpm build

test:
	cd apps/api && pnpm test

# ---------------------------------------------------------------------------
# Docker Dev
# ---------------------------------------------------------------------------
docker-db:
	docker-compose up postgres -d

docker-up:
	docker-compose up --build -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-build:
	docker-compose build --no-cache

# ---------------------------------------------------------------------------
# Docker Produção
# ---------------------------------------------------------------------------
docker-prod-up:
	docker-compose -f docker-compose.prod.yml up -d

docker-prod-down:
	docker-compose -f docker-compose.prod.yml down

# ---------------------------------------------------------------------------
# Limpeza
# ---------------------------------------------------------------------------
clean:
	find . -name "node_modules" -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name "dist" -type d -prune -exec rm -rf {} + 2>/dev/null || true
	find . -name ".next" -type d -prune -exec rm -rf {} + 2>/dev/null || true
	@echo "Limpeza concluída."
