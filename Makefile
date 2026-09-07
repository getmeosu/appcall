# Rust control plane and embedded dashboard, with Bun connector execution.
HTTP_ADDR ?= 127.0.0.1:5080
CARGO ?= cargo
BUILD_DIR := $(if $(CARGO_TARGET_DIR),$(CARGO_TARGET_DIR),target)

.PHONY: help
help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: deps
deps: ## Install Bun development dependencies
	bun install --frozen-lockfile

.PHONY: assets
assets: ## Verify the checked-in dashboard assets embedded by Rust
	@test -s crates/appcall-web/static/app.css
	@test -s crates/appcall-web/static/dashboard.css
	@test -s crates/appcall-web/static/dashboard.js
	@test -s crates/appcall-web/static/datastar.js

.PHONY: build
build: assets ## Build API, worker, qa and planctl into bin/
	$(CARGO) build --release --locked -p appcall-api -p appcall-worker -p appcall-cli --bins
	mkdir -p bin
	cp $(BUILD_DIR)/release/appcall-api $(BUILD_DIR)/release/appcall-worker $(BUILD_DIR)/release/qa $(BUILD_DIR)/release/planctl bin/

.PHONY: run
run: assets ## Run the Rust API and dashboard locally
	APPCALL_DEV_API_KEY=$${APPCALL_DEV_API_KEY:-devkey} APPCALL_HTTP_ADDR=$(HTTP_ADDR) $(CARGO) run --locked -p appcall-api --bin appcall-api

.PHONY: run-auth
run-auth: assets ## Run with Anusa-backed auth loaded from .env
	@test -f .env || { echo "Create .env and configure ANUSA_JWT_ACCESS_SECRET + APPCALL_SESSION_SECRET"; exit 1; }
	set -a; . ./.env; set +a; \
	if [ -z "$$ANUSA_JWT_ACCESS_SECRET" ] || [ -z "$$APPCALL_SESSION_SECRET" ]; then \
		echo "Set ANUSA_JWT_ACCESS_SECRET and APPCALL_SESSION_SECRET in .env"; exit 1; \
	fi; \
	APPCALL_HTTP_ADDR=$(HTTP_ADDR) $(CARGO) run --locked -p appcall-api --bin appcall-api

.PHONY: dev
dev: run ## Run development API (rerun after source changes)

.PHONY: test
test: test-runner test-web test-rust ## Run Bun and Rust tests

.PHONY: test-runner
test-runner: ## Run all Bun connector and supervisor tests
	bun test runner/

.PHONY: test-web
test-web: ## Test delegated dashboard interactions
	bun test crates/appcall-web/tests/*.test.js

.PHONY: test-rust
test-rust: ## Test Rust core, hosts and adapters
	$(CARGO) test --workspace --all-features --locked

.PHONY: test-integration
test-integration: ## Run explicit PostgreSQL/socket/process suites (requires both test DB URLs)
	@test -n "$$APPCALL_ENGINE_POSTGRES_URL" -a -n "$$APPCALL_TEST_DATABASE_URL"
	$(CARGO) test --workspace --all-features --locked -- --ignored

.PHONY: check-rust
check-rust: ## Check Rust formatting and warnings
	$(CARGO) fmt --all -- --check
	$(CARGO) clippy --workspace --all-targets --all-features --locked -- -D warnings

.PHONY: audit-rust
audit-rust: ## Audit the locked Rust dependency graph
	cargo audit

.PHONY: test-live
test-live: ## Run live connector tests (real providers; requires keys)
	bun test runner/live/

.PHONY: verify
verify: check-rust audit-rust build-clean test attribution-check ## Run portable local checks (integration and image gates are separate)

.PHONY: fmt-check
fmt-check: ## Fail if Rust sources need formatting
	$(CARGO) fmt --all -- --check

.PHONY: vet
vet: ## Check Rust warnings
	$(CARGO) clippy --workspace --all-targets --all-features --locked -- -D warnings

.PHONY: build-clean
build-clean: assets ## Build the locked workspace without local overrides
	$(CARGO) build --workspace --all-targets --all-features --locked

.PHONY: attribution-check
attribution-check: ## Check staged public files and license boundaries
	python3 scripts/public-release.py check --source . --index

.PHONY: docker-prep
docker-prep: build-clean ## Compatibility alias for the self-contained build check

.PHONY: docker-build
docker-build: ## Build API/worker and Bun runner images
	docker compose -f docker-compose.prod.yml --env-file .env.production build

.PHONY: docker-up
docker-up: ## Start the production database, runner, API and worker
	docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait

.PHONY: docker-down
docker-down: ## Stop production containers, preserving volumes
	docker compose -f docker-compose.prod.yml --env-file .env.production down

.PHONY: smoke-prod
smoke-prod: ## Build and probe the production topology with throwaway data
	./scripts/smoke-prod.sh
