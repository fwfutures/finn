# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Overview

**Finn** is a Slack bot that connects users to an AI agent powered by Claude SDK (Opus by default), with OpenRouter support for non-Anthropic models. It includes an admin dashboard built with SvelteKit for managing users, conversations, and model configuration.

## Architecture

```
finn/
├── src/
│   ├── index.ts                 # Main entry (Hono + Slack)
│   ├── config.ts                # Zod-validated environment config
│   │
│   ├── slack/                   # Slack Bot Integration
│   │   ├── app.ts               # Slack Bolt app (Socket Mode)
│   │   └── handlers/
│   │       ├── message.ts       # Direct message handler
│   │       ├── mention.ts       # @Finn mention handler
│   │       └── commands.ts      # Chat commands (model switching)
│   │
│   ├── ai/                      # AI Provider Layer
│   │   ├── provider.ts          # AI provider router/factory
│   │   ├── claude.ts            # Claude SDK integration
│   │   ├── openrouter.ts        # OpenRouter API integration
│   │   └── models.ts            # Model definitions and aliases
│   │
│   ├── services/                # Business Logic
│   │   ├── database.ts          # SQLite operations
│   │   ├── users.ts             # User management
│   │   ├── conversations.ts     # Conversation persistence
│   │   ├── messages.ts          # Message history
│   │   └── google.ts            # Google OAuth service
│   │
│   ├── store/                   # Database Layer
│   │   └── index.ts             # SQLite schema initialization
│   │
│   └── web/                     # Admin API (Hono)
│       ├── server.ts            # Hono app setup
│       ├── middleware/
│       │   └── auth.ts          # JWT session middleware
│       └── routes/
│           ├── auth.ts          # OAuth endpoints
│           └── api.ts           # REST API for admin
│
├── admin/                       # SvelteKit Admin Dashboard
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +page.svelte     # Dashboard
│   │   │   ├── +layout.svelte   # App layout
│   │   │   ├── login/           # Google OAuth login
│   │   │   ├── users/           # User management
│   │   │   ├── conversations/   # Conversation viewer
│   │   │   └── settings/        # Model config
│   │   └── lib/
│   │       ├── api.ts           # Backend API client
│   │       └── stores/          # Svelte stores
│   ├── package.json
│   └── svelte.config.js
│
├── data/                        # SQLite database (gitignored)
│   └── finn.db
│
├── routes.json                  # WAF route allowlist
├── package.json
├── tsconfig.json
└── .env                         # Configuration (gitignored)
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Hono + Bun |
| Slack | @slack/bolt (Socket Mode) |
| AI (Claude) | @anthropic-ai/sdk |
| AI (Other) | OpenRouter API |
| Database | SQLite (better-sqlite3) |
| Admin UI | SvelteKit |
| Auth | Google OAuth + JWT sessions |
| Deployment | Systemd + Caddy |

## Commands

### Development

```bash
# Install dependencies
bun install
cd admin && bun install

# Run backend (development)
bun run dev

# Run admin UI (development)
cd admin && bun run dev

# Build all
bun run build
cd admin && bun run build
```

### Production (Systemd)

```bash
# Service status
sudo systemctl status finn

# Restart service
sudo systemctl restart finn

# View logs
sudo journalctl -u finn -f

# View recent logs
sudo journalctl -u finn -n 100 --no-pager
```

### Quick Deploy

```bash
# Pull, build, restart
git pull && bun run build && sudo systemctl restart finn
```

## Configuration

Environment variables in `.env`:

```bash
# Server
PORT=3004
HOST=0.0.0.0
PUBLIC_URL=https://finn.freshwaterfutures.com

# Slack (Socket Mode)
SLACK_BOT_TOKEN=xoxb-xxx           # Bot User OAuth Token
SLACK_APP_TOKEN=xapp-xxx           # App-Level Token (for Socket Mode)
SLACK_SIGNING_SECRET=xxx           # Request verification

# AI Providers
ANTHROPIC_API_KEY=sk-ant-xxx       # Claude SDK
OPENROUTER_API_KEY=sk-or-xxx       # OpenRouter (GPT-4, Gemini, etc.)

# Google OAuth (Admin UI)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
ALLOWED_EMAILS=admin@example.com   # Comma-separated admin emails

# Database
DATABASE_PATH=./data/finn.db

# Session
SESSION_SECRET=your-32-char-secret-minimum

# Defaults
DEFAULT_MODEL=claude-opus
DEFAULT_SYSTEM_PROMPT=You are Finn, a helpful AI assistant...
```

## Slack Chat Commands

Users can interact with Finn via DMs or @mentions:

| Command | Description |
|---------|-------------|
| `use <model>` | Switch AI model (e.g., "use gpt-4", "use claude-sonnet") |
| `models` | List available models |
| `reset` | Clear conversation context |
| `help` | Show available commands |

## Available Models

### Claude (via Claude SDK)
- `claude-opus` - Claude Opus 4 (default)
- `claude-sonnet` - Claude Sonnet 4

### OpenRouter (non-Anthropic)
- `gpt-4` - OpenAI GPT-4
- `gpt-4o` - OpenAI GPT-4o
- `gemini-pro` - Google Gemini Pro
- `llama-3` - Meta Llama 3

## Admin Dashboard

Access at `https://finn.freshwaterfutures.com/admin/`

| Page | Description |
|------|-------------|
| Dashboard | Stats, usage charts, recent activity |
| Users | User list, role management |
| Conversations | Full conversation history viewer |
| Settings | Model configuration, system prompt |

### User Roles

- `user` - Regular Slack users
- `admin` - Can view all conversations
- `super_admin` - Full access including settings

## Database Schema

```sql
-- Core tables
users              -- Slack users with roles
conversations      -- Chat threads
messages           -- Message history with token counts
model_config       -- Available AI models
admin_sessions     -- Admin UI sessions
usage_daily        -- Daily usage aggregates
```

## API Endpoints

### Public
- `GET /health` - Health check

### Admin API (requires auth)
- `GET /api/users` - List users
- `GET /api/users/:id` - User detail
- `POST /api/users/:id/role` - Update role
- `GET /api/conversations` - List conversations
- `GET /api/conversations/:id` - Conversation detail
- `GET /api/models` - List models
- `POST /api/models/:id` - Update model config
- `GET /api/usage` - Usage statistics

## Deployment

### Initial Setup

1. **DNS**: Add A record for `finn.freshwaterfutures.com`
   ```bash
   # From claudecentral
   task dns -- add finn <server-ip>
   ```

2. **WAF**: Generate Caddy config
   ```bash
   task security:waf:generate
   ```

3. **Service**: Install systemd service
   ```bash
   sudo cp finn.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable finn
   sudo systemctl start finn
   ```

### Slack App Setup

1. Create app at https://api.slack.com/apps
2. Enable **Socket Mode** (requires App-Level Token)
3. Add bot scopes: `chat:write`, `im:history`, `im:read`, `app_mentions:read`
4. Install to workspace
5. Copy tokens to `.env`

## Troubleshooting

### Slack not responding
```bash
# Check service logs
sudo journalctl -u finn -n 50 --no-pager

# Verify Socket Mode connection
# Look for "⚡️ Bolt app is running!" in logs
```

### AI response errors
```bash
# Check API keys are set
grep -E "ANTHROPIC|OPENROUTER" .env

# Test Claude directly
curl https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" ...
```

### Database issues
```bash
# Check database exists
ls -la data/finn.db

# Reset database (CAUTION: deletes all data)
rm data/finn.db && bun run migrate
```

### Admin UI not loading
```bash
# Check SvelteKit build
cd admin && bun run build

# Verify static files served
ls -la admin/build/
```

## Service File

Located at `/etc/systemd/system/finn.service`:

```ini
[Unit]
Description=Finn Slack Bot
After=network.target

[Service]
Type=simple
User=claude
WorkingDirectory=/home/claude/finn
ExecStart=/home/claude/.bun/bin/bun run src/index.ts
EnvironmentFile=/home/claude/finn/.env
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Testing

### Test Slack Connection
Send a DM to the Finn bot - you should get a response.

### Test Model Switching
```
You: use gpt-4
Finn: Switched to GPT-4. How can I help?
```

### Test Admin API
```bash
curl -s http://localhost:3004/health
# {"status":"ok"}
```
