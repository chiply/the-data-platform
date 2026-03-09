#!/usr/bin/env bash
# setup-ai-tools.sh — Install Claude Code skills and configure MCP servers
#
# Usage: ./scripts/setup-ai-tools.sh [--upgrade]
#
# Installs all agent skills into .agents/skills/ (symlinked to .claude/skills/)
# and creates .claude/settings.local.json with MCP server configuration.
#
# Options:
#   --upgrade   Re-install all skills even if already present

set -euo pipefail

UPGRADE=0
for arg in "$@"; do
  case "$arg" in
    --upgrade) UPGRADE=1 ;;
    -h|--help)
      echo "Usage: ./scripts/setup-ai-tools.sh [--upgrade]"
      echo "  --upgrade   Re-install all skills even if already present"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ---------- helpers ----------

info()  { printf '  \033[1;34m→\033[0m %s\n' "$1"; }
ok()    { printf '  \033[1;32m✓\033[0m %s\n' "$1"; }
warn()  { printf '  \033[1;33m!\033[0m %s\n' "$1"; }
error() { printf '  \033[1;31m✗\033[0m %s\n' "$1"; }

check_prereq() {
  if ! command -v "$1" &>/dev/null; then
    error "$1 is not installed. $2"
    return 1
  fi
  ok "$1 found"
}

# ---------- prerequisite checks ----------

echo ""
echo "Checking prerequisites..."
echo ""

MISSING=0
check_prereq npx "Install Node.js: brew install node" || MISSING=1
check_prereq uvx "Install uv: brew install uv" || MISSING=1

if [[ $MISSING -eq 1 ]]; then
  echo ""
  error "Missing prerequisites. Install them and re-run."
  exit 1
fi

echo ""

# ---------- skills ----------

echo "Installing Claude Code skills..."
echo ""

declare -A SKILLS=(
  # Pulumi / IaC
  ["pulumi-typescript"]="https://github.com/dirien/claude-skills"
  ["pulumi-esc"]="https://github.com/pulumi/agent-skills"
  ["pulumi-best-practices"]="https://github.com/pulumi/agent-skills"

  # Kubernetes & compute
  ["kubernetes-specialist"]="https://github.com/jeffallan/claude-skills"
  ["k8s-security-policies"]="https://github.com/wshobson/agents"
  ["gitops-workflow"]="https://github.com/wshobson/agents"
  ["helm-chart-development"]="https://github.com/laurigates/claude-plugins"

  # Docker & containers
  ["docker-best-practices"]="https://github.com/josiahsiegel/claude-plugin-marketplace"

  # Tilt dev workflow
  ["tilt"]="https://github.com/0xbigboss/claude-code"
  ["tiltup"]="https://github.com/0xbigboss/claude-code"

  # Monitoring & observability
  ["monitoring-expert"]="https://github.com/jeffallan/claude-skills"

  # CI/CD & GitOps
  ["github-actions-templates"]="https://github.com/wshobson/agents"

  # DevOps & SRE
  ["devops-engineer"]="https://github.com/jeffallan/claude-skills"
  ["sre-engineer"]="https://github.com/jeffallan/claude-skills"

  # Security
  ["api-security-best-practices"]="https://github.com/sickn33/antigravity-awesome-skills"

  # Cost & operations
  ["cost-optimization"]="https://github.com/wshobson/agents"
  ["incident-runbook-templates"]="https://github.com/wshobson/agents"

  # Debugging
  ["systematic-debugging"]="https://github.com/obra/superpowers"
)

INSTALLED=0
SKIPPED=0

UPGRADED=0

for skill in "${!SKILLS[@]}"; do
  repo="${SKILLS[$skill]}"
  if [[ -d ".agents/skills/$skill" ]] && [[ $UPGRADE -eq 0 ]]; then
    ok "$skill (already installed)"
    SKIPPED=$((SKIPPED + 1))
  else
    if [[ -d ".agents/skills/$skill" ]]; then
      rm -rf ".agents/skills/$skill"
      UPGRADED=$((UPGRADED + 1))
    fi
    info "Installing $skill..."
    if npx skills add "$repo" --skill "$skill" -y >/dev/null 2>&1; then
      ok "$skill"
      INSTALLED=$((INSTALLED + 1))
    else
      error "$skill — install failed"
    fi
  fi
done

echo ""
echo "Skills: $INSTALLED installed, $UPGRADED upgraded, $SKIPPED already present"
echo ""

# ---------- MCP servers ----------

echo "Configuring MCP servers..."
echo ""

SETTINGS_FILE=".claude/settings.local.json"
mkdir -p .claude

if [[ -f "$SETTINGS_FILE" ]]; then
  warn "$SETTINGS_FILE already exists — skipping (delete it to regenerate)"
else
  cat > "$SETTINGS_FILE" <<SETTINGS
{
  "mcpServers": {
    "kubernetes": {
      "command": "npx",
      "args": ["-y", "kubernetes-mcp-server@latest"],
      "env": {
        "KUBECONFIG": "${HOME}/.kube/config"
      }
    },
    "pulumi": {
      "command": "npx",
      "args": ["-y", "@pulumi/mcp-server@latest", "stdio"]
    },
    "docker-mcp": {
      "command": "uvx",
      "args": ["docker-mcp"]
    }
  }
}
SETTINGS
  ok "Created $SETTINGS_FILE"
fi

echo ""
echo "Done! Restart Claude Code to activate MCP servers."
echo ""
echo "MCP prerequisites:"
echo "  • PULUMI_ACCESS_TOKEN must be set for Pulumi MCP (run: pulumi login)"
echo "  • ~/.kube/config is populated after running 'pulumi up' on the cluster layer"
echo "  • Docker daemon must be running for docker-mcp"
echo ""
