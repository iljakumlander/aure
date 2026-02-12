# aure

A self-hosted answering machine for your personal site.
Runs on a Raspberry Pi with a local LLM via Ollama.
No cloud, no cost, no data leaving your network.

## What it does

A visitor opens your site, sees a chat, types a message.
aure checks it against spam filters, then keyword rules,
then asks the local LLM — with your CV and notes as context.
The visitor gets a response. You review conversations later
through the admin API, at your own pace.

## Quick start

```bash
git clone git@github.com:iljakumlander/aure.git
cd aure
npm install

# Option A: Copy example data and configure
cp -r data.example data
# Edit data/config.yaml, data/persona.yaml, data/rules.yaml

# Option B: Point to a separate data repo
cp .env.example .env
# Edit .env — set AURE_DATA_DIR to your data directory

# Start (Ollama must be running)
npm run dev
```

Open `http://localhost:3000` — you'll see the chat.

## How it works

```
visitor message
      │
      ▼
  spam rules ──→ flag / drop
      │
      ▼
 keyword rules ──→ canned response (no LLM call)
      │
      ▼
   LLM call ──→ response based on your data
      │
      ▼
   fallback ──→ honest "I don't know"
```

## Data directory

Your private data lives in `data/` (gitignored). Structure:

```
data/
├── config.yaml      # server port, LLM provider, data sources, admin token
├── persona.yaml     # name, system prompt, greeting, fallback, languages
├── rules.yaml       # keyword rules + spam filters
├── notes/           # your thoughts as markdown files
└── cv/              # your CV as JSON (any structure)
```

See `data.example/` for templates.

You can keep your data in a separate private repo
and point aure to it via `.env`:

```
AURE_DATA_DIR=../my-aure-data
```

## API

### Visitor (public)

```
POST /api/chat/start                        → { conversationId, greeting }
POST /api/chat/:conversationId/message      → { response, source }
GET  /api/chat/:conversationId              → { conversation, messages }
```

### Admin (token in Authorization header)

```
GET    /api/admin/digest                    → summary since last visit
GET    /api/admin/conversations             → list all
GET    /api/admin/conversations/:id         → conversation + messages
PATCH  /api/admin/conversations/:id         → update (pin, spam, etc.)
DELETE /api/admin/conversations/:id         → delete
```

### Health

```
GET /api/health → { status, llm, version }
```

## Raspberry Pi setup

Ollama runs on Raspberry Pi 5 (16GB RAM) with ARM64.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model (gemma3:1b — best speed/quality on Pi 5)
ollama pull gemma3:1b

# Verify
ollama list
```

Default model is `gemma3:1b` (~1.5GB RAM, 15-20 tok/s on Pi 5, 128K context).
For multilingual (Russian etc.): `qwen2.5:3b` (~2.2GB, ~5-8 tok/s).

## LLM providers

Default is Ollama (local). To use a cloud provider, edit `data/config.yaml`:

```yaml
provider:
  type: anthropic   # or: openai
  apiKey: ${ANTHROPIC_API_KEY}
  model: claude-sonnet-4-20250514
```

Cloud providers are not yet implemented — contributions welcome.
The adapter interface is simple: see `src/llm/provider.ts`.

## Stack

- TypeScript + Node.js (>=20)
- Hono (HTTP server)
- better-sqlite3 (conversations)
- Ollama (local LLM)
- Vanilla HTML/JS (chat frontend)

## License

MIT
