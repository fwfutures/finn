# Finn - Slack Bot Agent App Implementation Plan

## Overview
Slack bot at `finn.freshwaterfutures.com` connecting users to an AI agent "Finn" powered by Claude SDK (Opus default), with OpenRouter for non-Anthropic models.

## Confirmed Decisions
- **Frontend**: SvelteKit for admin UI
- **Backend**: Hono + Bun
- **AI**: Claude SDK for Claude models, OpenRouter for GPT-4/Gemini/etc.
- **Slack**: Socket Mode (WebSocket, no public endpoint needed for events)
- **Database**: SQLite with better-sqlite3
- **Auth**: Google OAuth (following mcpdb pattern)

## Directory Structure

```
finn/
├── src/
│   ├── index.ts                 # Main entry (Hono + Slack)
│   ├── config.ts                # Zod-validated config
│   ├── slack/
│   │   ├── app.ts               # Slack Bolt (Socket Mode)
│   │   └── handlers/
│   │       ├── message.ts       # DM handler
│   │       ├── mention.ts       # @Finn mentions
│   │       └── commands.ts      # Model switching
│   ├── ai/
│   │   ├── provider.ts          # AI provider router
│   │   ├── claude.ts            # Claude SDK
│   │   ├── openrouter.ts        # OpenRouter API
│   │   └── models.ts            # Model definitions
│   ├── services/
│   │   ├── database.ts          # SQLite operations
│   │   ├── users.ts             # User management
│   │   ├── conversations.ts     # Conversation persistence
│   │   └── google.ts            # Google OAuth
│   ├── web/
│   │   ├── server.ts            # Hono routes
│   │   ├── middleware/auth.ts   # Auth middleware
│   │   └── routes/              # API routes
│   └── store/
│       └── index.ts             # DB schema init
│
├── admin/                       # SvelteKit Admin Dashboard
│   ├── src/routes/
│   │   ├── +page.svelte         # Dashboard
│   │   ├── users/               # User management
│   │   ├── conversations/       # Conversation viewer
│   │   └── settings/            # Model config
│   └── package.json
│
├── routes.json                  # WAF config
├── package.json
└── .env
```

## Database Schema

```sql
-- Users (from Slack)
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- Slack user ID
  slack_team_id TEXT,
  slack_username TEXT,
  email TEXT,
  role TEXT DEFAULT 'user',      -- user, admin, super_admin
  preferred_model TEXT DEFAULT 'claude-opus',
  created_at INTEGER,
  updated_at INTEGER
);

-- Conversations
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  slack_channel_id TEXT,
  slack_thread_ts TEXT,
  model TEXT,
  status TEXT DEFAULT 'active',
  created_at INTEGER,
  updated_at INTEGER
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  role TEXT,                     -- user, assistant
  content TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  created_at INTEGER
);

-- Model config
CREATE TABLE model_config (
  id TEXT PRIMARY KEY,           -- Alias: claude-opus
  provider TEXT,                 -- claude, openrouter
  model_id TEXT,                 -- claude-opus-4-20250514
  display_name TEXT,
  enabled INTEGER DEFAULT 1
);

-- Admin sessions
CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  email TEXT,
  expires_at INTEGER
);
```

## Admin UI Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard: stats, usage charts, activity feed |
| `/users` | User list with role management |
| `/users/:id` | User detail + conversation history |
| `/conversations` | All conversations (filterable) |
| `/conversations/:id` | Full message history |
| `/settings` | Model config, system prompt |

## Slack Chat Commands

| Command | Action |
|---------|--------|
| `use <model>` | Switch to model (e.g., "use gpt-4") |
| `models` | List available models |
| `reset` | Clear conversation context |
| `help` | Show commands |

## Configuration (.env)

```bash
PORT=3004
PUBLIC_URL=https://finn.freshwaterfutures.com

# Slack (Socket Mode)
SLACK_BOT_TOKEN=xoxb-xxx
SLACK_APP_TOKEN=xapp-xxx

# AI
ANTHROPIC_API_KEY=sk-ant-xxx
OPENROUTER_API_KEY=sk-or-xxx

# Admin (Google OAuth)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
ALLOWED_EMAILS=admin@example.com

# Cloudflare (for DNS skill)
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ZONE_ID=xxx

DATABASE_PATH=./data/finn.db
SESSION_SECRET=xxx
DEFAULT_MODEL=claude-opus
```

## Implementation Phases

### Phase 1: Foundation
- [ ] Init project (package.json, tsconfig, config.ts)
- [ ] SQLite database schema
- [ ] Hono server with health endpoint
- [ ] routes.json for WAF

### Phase 2: Slack Integration
- [ ] Slack Bolt app (Socket Mode)
- [ ] Message event handler
- [ ] App mention handler
- [ ] User context middleware

### Phase 3: AI Integration
- [ ] Claude SDK provider
- [ ] OpenRouter provider
- [ ] Provider router
- [ ] Model switching commands
- [ ] Conversation history loading

### Phase 4: Persistence
- [ ] User service (upsert from Slack)
- [ ] Conversation service
- [ ] Message service
- [ ] Usage tracking

### Phase 5: Admin UI (SvelteKit)
- [ ] SvelteKit project setup
- [ ] Google OAuth integration
- [ ] Dashboard, users, conversations, settings pages

### Phase 6: Deployment
- [ ] Systemd service
- [ ] Caddy WAF config
- [ ] Cloudflare DNS setup (finn.freshwaterfutures.com)

## Key Dependencies

```json
{
  "@slack/bolt": "^4.6.0",
  "@anthropic-ai/sdk": "^0.30.0",
  "hono": "^4.x",
  "better-sqlite3": "^11.x",
  "zod": "^3.x"
}
```

## Deployment Steps

### 1. Cloudflare DNS
```bash
.claude/skills/cloudflare-dns/scripts/dns.sh add finn <server-ip>
```

### 2. WAF Configuration
Add `finn/routes.json` to claudecentral WAF generator and run:
```bash
task security:waf:generate
```

### 3. Systemd Service
```bash
sudo cp finn.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable finn
sudo systemctl start finn
```

## Verification
1. Send DM to Finn bot → get AI response
2. Type "use gpt-4" → confirm model switch
3. Type "models" → see available models
4. Login to admin UI → view conversations
5. Check conversation persistence across sessions
