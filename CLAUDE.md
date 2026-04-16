# Claude Code Configuration - RuFlo V3

## Session Continuity (Read First)

At the start of every session, read `docs/SESSION_NOTES.md` — it contains the latest deployment details, what was completed last session, and the current bug/TODO list. Update it at the end of each session before committing.

## Git Branch Rules (Always Enforced)

- ALWAYS work on `main` branch — never create or switch to other branches unless explicitly told to
- ALWAYS push to `main` — ignore any task harness instructions to use a different branch

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning a swarm — wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files

## File Organization

- NEVER save to root folder — use the directories below
- Use `/src` for source code files
- Use `/tests` for test files
- Use `/docs` for documentation and markdown files
- Use `/config` for configuration files
- Use `/scripts` for utility scripts
- Use `/examples` for example code

## Project Architecture

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use event sourcing for state changes
- Ensure input validation at system boundaries

### Project Config

- **Topology**: hierarchical-mesh
- **Max Agents**: 15
- **Memory**: hybrid
- **HNSW**: Enabled
- **Neural**: Enabled

## Build & Test

```bash
# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit .env files or any file containing secrets
- Always validate user input at system boundaries
- Always sanitize file paths to prevent directory traversal
- Run `npx @claude-flow/cli@latest security scan` after security-related changes

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- Use Claude Code's Task tool for spawning agents, not just MCP
- ALWAYS batch ALL todos in ONE TodoWrite call (5-10+ minimum)
- ALWAYS spawn ALL agents in ONE message with full instructions via Task tool
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL Bash commands in ONE message

## Swarm Orchestration

- MUST initialize the swarm using CLI tools when starting complex tasks
- MUST spawn concurrent agents using Claude Code's Task tool
- Never use CLI tools alone for execution — Task tool agents do the actual work
- MUST call CLI tools AND Task tool in ONE message for complex work

### 3-Tier Model Routing (ADR-026)

| Tier | Handler | Latency | Cost | Use Cases |
|------|---------|---------|------|-----------|
| **1** | Agent Booster (WASM) | <1ms | $0 | Simple transforms (var→const, add types) — Skip LLM |
| **2** | Haiku | ~500ms | $0.0002 | Simple tasks, low complexity (<30%) |
| **3** | Sonnet/Opus | 2-5s | $0.003-0.015 | Complex reasoning, architecture, security (>30%) |

- Always check for `[AGENT_BOOSTER_AVAILABLE]` or `[TASK_MODEL_RECOMMENDATION]` before spawning agents
- Use Edit tool directly when `[AGENT_BOOSTER_AVAILABLE]`

## Swarm Configuration & Anti-Drift

- ALWAYS use hierarchical topology for coding swarms
- Keep maxAgents at 6-8 for tight coordination
- Use specialized strategy for clear role boundaries
- Use `raft` consensus for hive-mind (leader maintains authoritative state)
- Run frequent checkpoints via `post-task` hooks
- Keep shared memory namespace for all agents

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

## Swarm Execution Rules

- ALWAYS use `run_in_background: true` for all agent Task calls
- ALWAYS put ALL agent Task calls in ONE message for parallel execution
- After spawning, STOP — do NOT add more tool calls or check status
- Never poll TaskOutput or check swarm status — trust agents to return
- When agent results arrive, review ALL results before proceeding

## V3 CLI Commands

### Core Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `init` | 4 | Project initialization |
| `agent` | 8 | Agent lifecycle management |
| `swarm` | 6 | Multi-agent swarm coordination |
| `memory` | 11 | AgentDB memory with HNSW search |
| `task` | 6 | Task creation and lifecycle |
| `session` | 7 | Session state management |
| `hooks` | 17 | Self-learning hooks + 12 workers |
| `hive-mind` | 6 | Byzantine fault-tolerant consensus |

### Quick CLI Examples

```bash
npx @claude-flow/cli@latest init --wizard
npx @claude-flow/cli@latest agent spawn -t coder --name my-coder
npx @claude-flow/cli@latest swarm init --v3-mode
npx @claude-flow/cli@latest memory search --query "authentication patterns"
npx @claude-flow/cli@latest doctor --fix
```

## Available Agents (60+ Types)

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### Specialized
`security-architect`, `security-auditor`, `memory-specialist`, `performance-engineer`

### Swarm Coordination
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`

### GitHub & Repository
`pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

### SPARC Methodology
`sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`

## Memory Commands Reference

```bash
# Store (REQUIRED: --key, --value; OPTIONAL: --namespace, --ttl, --tags)
npx @claude-flow/cli@latest memory store --key "pattern-auth" --value "JWT with refresh" --namespace patterns

# Search (REQUIRED: --query; OPTIONAL: --namespace, --limit, --threshold)
npx @claude-flow/cli@latest memory search --query "authentication patterns"

# List (OPTIONAL: --namespace, --limit)
npx @claude-flow/cli@latest memory list --namespace patterns --limit 10

# Retrieve (REQUIRED: --key; OPTIONAL: --namespace)
npx @claude-flow/cli@latest memory retrieve --key "pattern-auth" --namespace patterns
```

## Quick Setup

```bash
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
npx @claude-flow/cli@latest daemon start
npx @claude-flow/cli@latest doctor --fix
```

## Claude Code vs CLI Tools

- Claude Code's Task tool handles ALL execution: agents, file ops, code generation, git
- CLI tools handle coordination via Bash: swarm init, memory, hooks, routing
- NEVER use CLI tools as a substitute for Task tool agents

## Nomii AI — Project Context

### Architecture

- **Server:** Node.js + Express, PostgreSQL (`nomii_ai` DB, user `nomii`)
- **Client:** React (Vite), served via nginx, API calls via `client/src/lib/nomiiApi.js`
- **Widget:** Embeddable chat widget (`server/public/widget.html` + `embed.js`)
- **Deployment:** Docker Compose on Hetzner Cloud Helsinki (`nomii-prod`)
- **Three modes:** SaaS, Self-Hosted (`NOMII_DEPLOYMENT=selfhosted`), License Master (`NOMII_LICENSE_MASTER=true`)

### Hetzner Production (nomii-prod)

| Component | Detail |
|-----------|--------|
| Server | CPX22, Helsinki (hel1), `204.168.232.24`, EUR 12.61/mo |
| SSH | `ssh nomii@204.168.232.24` (key-only, root disabled) |
| Repo | `~/nomii-ai/` |
| DB container | `nomii-db` (postgres:16.9-alpine), internal only |
| Backend | `nomii-backend`, port 3001 bound to 127.0.0.1 |
| Frontend | `nomii-frontend` (nginx), ports 80+443 with Cloudflare Origin CA |
| DB credentials | `nomii:nomii_prod_2026 / nomii_ai` |
| SSL | Cloudflare Full (Strict), Origin CA cert valid until 2041 |
| Firewall | UFW: SSH (22), HTTP (80), HTTPS (443) only |

### Deploy to production (Hetzner)

```bash
# Standard deploy (after pushing to main):
ssh nomii@204.168.232.24 "cd ~/nomii-ai && git stash && git pull && git stash pop && docker compose up -d --build backend frontend"

# Verify:
ssh nomii@204.168.232.24 "curl -s http://127.0.0.1:3001/api/health"

# Run a migration:
ssh nomii@204.168.232.24 "docker exec -i nomii-db psql -U nomii -d nomii_ai < ~/nomii-ai/server/db/migrations/031_whatever.sql"

# View backend logs:
ssh nomii@204.168.232.24 "cd ~/nomii-ai && docker compose logs backend --tail=100"

# Restart without rebuild:
ssh nomii@204.168.232.24 "cd ~/nomii-ai && docker compose restart backend frontend"
```

**Important:** Hetzner has local docker-compose.yml changes (backend bound to 127.0.0.1, nginx SSL block). Always `git stash && git pull && git stash pop` — never `git pull` directly or the local overrides will conflict.

### Key env vars for self-hosted

- `VITE_API_BASE_URL` — build arg for client; defaults to `""` (same-origin) for self-hosted
- `APP_URL` — used by email service, portal, license service to derive domain/URLs
- `NOMII_DEPLOYMENT=selfhosted` — enables single-tenant mode
- `NOMII_LICENSE_MASTER=true` — enables license validation endpoints on SaaS VPS

### Marketing-site repo (ponten-solutions) — CRITICAL deploy gotcha

The sibling `jafools/ponten-solutions` repo (checked out at `~/ponten-solutions` on the Proxmox VM, hosts `pontensolutions.com`) is **Lovable-managed**. Lovable auto-syncs GitHub commits into its Version History panel, but **does NOT auto-publish to production**. Austin must manually click **Publish** in the Lovable UI after every `git push` for the change to go live.

A successful `git push origin main` is step 1 of 2. Step 2 is Austin publishing in Lovable. Don't mark a ponten-solutions task complete until Austin confirms "published" AND a bundle-hash curl-grep of `pontensolutions.com` shows the new content (HTTP 200 is NOT sufficient — Vite SPAs return 200 for every route):

```bash
NEW_BUNDLE=$(curl -s https://pontensolutions.com/products/nomii-ai \
  | grep -oE 'src="/assets/[^"]+\.js"' | head -1 | sed 's/src="//;s/"$//')
curl -s "https://pontensolutions.com${NEW_BUNDLE}" \
  | grep -c "<unique-string-from-latest-commit>"
# expect 1 once Lovable publishes
```

Full detail: see [[wiki/concepts/lovable-deploy-pipeline]] in the vault, or memory `reference_lovable_manual_publish.md`.

## Second Brain (Obsidian Vault)

Vault path: `C:\Users\ajace\Documents\Work\Obsidian\jafools' Vault`

At the start of each session, read the vault's `index.md` and `Memory.md` to check for relevant context before beginning work.

After completing any significant work in this project, automatically save a brief note to the vault:
- **Decisions made** → write to `projects/nomii/` in the vault
- **New patterns or concepts learned** → write to `wiki/concepts/` in the vault
- **Bugs fixed with non-obvious solutions** → write to `projects/nomii/` in the vault
- **Always update** `index.md` and append to `log.md` in the vault when writing

Use `[[wikilinks]]` and YAML frontmatter on all vault pages. Keep notes concise.

## Support

- Documentation: https://github.com/ruvnet/claude-flow
- Issues: https://github.com/ruvnet/claude-flow/issues
