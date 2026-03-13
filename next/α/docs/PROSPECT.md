# Aure α — RAG Engine Prospect

> Retrieval-Augmented Generation layer for Aure.
> Local-first, hardware-aware, source-transparent.

---

## 1. Vision

Aure α replaces the "load everything into context" approach of Aure v1 with a proper
retrieval pipeline. Documents go into a `reference/` folder. The system ingests them —
extracting text, splitting into chunks, computing embeddings, and storing vectors in a
pluggable database. At query time, the user's prompt is embedded, matched against stored
vectors, and only the most relevant chunks are injected into the LLM context window.

Every response carries **sources**: which document, which section, which text fragment
triggered the retrieval. The visitor (or admin) sees exactly *why* the LLM said what it said.

---

## 2. Design Principles

- **Local-only by default.** No data leaves the network. Ollama for both LLM and embeddings.
- **Hardware-aware.** Presets for Pi 5, Apple Silicon (M-series), and GPU/cloud deployments.
  The same codebase adapts chunk sizes, embedding dimensions, retrieval depth, and DB backend.
- **Pluggable vector storage.** A thin adapter interface lets you swap sqlite-vec for LanceDB,
  Qdrant, Milvus, or anything else without touching the ingestion or retrieval logic.
- **Incremental indexing.** Only new or changed files get processed. A content hash tracks
  what's already embedded.
- **Source transparency.** Every retrieved chunk carries provenance metadata — file path,
  page number, section heading, character offsets — so responses can cite and highlight sources.
- **Extensible document support.** PDF, Markdown, plain text, EPUB out of the box. The parser
  interface is open for DOCX, HTML, or any future format.
- **Two-package architecture.** α is a standalone RAG library; `apps/web` is the chat
  application that consumes it. Clean separation of concerns.

---

## 3. Architecture

### 3.1 Repository Structure

```
next/
├── α/                              # RAG engine (standalone library)
│   ├── src/
│   │   ├── cli/                    # CLI commands
│   │   ├── config/                 # Config loader, presets, schema
│   │   ├── parsers/                # Document parsers (pdf, md, txt, epub)
│   │   ├── chunker/                # Text splitting (semantic + fixed)
│   │   ├── embedder/               # Ollama embedding adapter
│   │   ├── vectordb/               # Vector DB adapters (sqlite-vec, ...)
│   │   ├── ingestion/              # Pipeline orchestrator + tracker
│   │   ├── retriever/              # Similarity search + highlights + reranker
│   │   ├── types/                  # Shared type definitions
│   │   └── index.ts                # Library exports
│   ├── docs/
│   │   └── PROSPECT.md             # This file
│   ├── config.yaml                 # Active configuration
│   ├── reference/                  # Document folder (user-managed)
│   ├── aure-vectors.db             # sqlite-vec database (generated)
│   └── package.json                # @aure/alpha
│
├── apps/
│   └── web/                        # Chat application (consumes α)
│       ├── src/
│       │   ├── chat/               # Responder + job processor
│       │   ├── db/                 # Chat database (conversations, messages)
│       │   ├── llm/                # Ollama streaming LLM adapter
│       │   ├── persona/            # Persona loader + defaults
│       │   ├── server/             # Hono API routes + SSE manager
│       │   ├── types/              # Chat-specific types
│       │   └── index.ts            # Server entry point
│       ├── public/                 # Frontend (vanilla HTML/JS/CSS)
│       │   ├── index.html
│       │   ├── chat.js
│       │   └── style.css
│       ├── persona.yaml            # Persona configuration
│       ├── aure-chat.db            # Conversation database (generated)
│       └── package.json            # @aure/web
│
└── .git/                           # Monorepo root
```

### 3.2 Ingestion Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     INGESTION PIPELINE                      │
│                                                             │
│  reference/          ┌──────────┐   ┌──────────┐           │
│  ├── paper.pdf  ───▶ │  Parser  │──▶│ Chunker  │──┐        │
│  ├── notes.md   ───▶ │ (extract)│   │ (split)  │  │        │
│  ├── book.epub  ───▶ └──────────┘   └──────────┘  │        │
│  └── faq.txt    ───▶                               │        │
│                                                    ▼        │
│                      ┌──────────┐   ┌──────────────────┐    │
│                      │ Embedder │◀──│ Chunks + Metadata │    │
│                      │ (Ollama) │   └──────────────────┘    │
│                      └────┬─────┘                           │
│                           ▼                                 │
│                    ┌──────────────┐                          │
│                    │  Vector DB   │                          │
│                    │  (adapter)   │                          │
│                    └──────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 Query Flow (apps/web)

```
┌─────────────────────────────────────────────────────────────┐
│                      RETRIEVAL + CHAT                       │
│                                                             │
│  visitor message ──▶ combine unresponded messages           │
│                              │                              │
│                              ▼                              │
│              ┌─────────────────────────────┐                │
│              │  α retriever                │                │
│              │  embed query → vector search │                │
│              │  → top-k → rerank (opt)     │                │
│              │  → highlight extraction     │                │
│              └──────────┬──────────────────┘                │
│                         ▼                                   │
│              ┌─────────────────────────────┐                │
│              │  Context builder            │                │
│              │  persona.systemPrompt       │                │
│              │  + persona.instructions     │                │
│              │  + [Source N: file > §] text │                │
│              │  + conversation history     │                │
│              └──────────┬──────────────────┘                │
│                         ▼                                   │
│              ┌─────────────────────────────┐                │
│              │  Ollama /api/chat (stream)  │                │
│              │  token → SSE → browser      │                │
│              │  done → save + attach srcs  │                │
│              └──────────┬──────────────────┘                │
│                         ▼                                   │
│              ┌─────────────────────────────┐                │
│              │  Response + source pills    │                │
│              │  [file.pdf > §Heading  87%] │                │
│              │  hover → highlighted text   │                │
│              └─────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Core Interfaces (α library)

### 4.1 Vector DB Adapter

```typescript
interface VectorDBAdapter {
  initialize(): Promise<void>;
  upsert(entries: VectorEntry[]): Promise<void>;
  search(query: number[], topK: number, filter?: SearchFilter): Promise<SearchResult[]>;
  deleteByDocument(documentId: string): Promise<void>;
  stats(): Promise<DBStats>;
  close(): Promise<void>;
}

interface VectorEntry {
  id: string;                   // Unique chunk ID
  documentId: string;           // Parent document identifier
  vector: number[];             // Embedding vector
  metadata: ChunkMetadata;      // Source info for attribution
}

interface SearchResult {
  entry: VectorEntry;
  score: number;                // Similarity score (0-1)
}

interface ChunkMetadata {
  filePath: string;             // Original file path in reference/
  fileName: string;             // File name for display
  pageNumber?: number;          // PDF page number
  sectionHeading?: string;      // Nearest heading
  charStart: number;            // Character offset in source
  charEnd: number;              // Character offset end
  chunkIndex: number;           // Position in document's chunk sequence
  text: string;                 // The raw chunk text (for highlighting)
}
```

### 4.2 Parser

```typescript
interface DocumentParser {
  extensions: string[];
  parse(filePath: string): Promise<ParsedDocument>;
}

interface ParsedDocument {
  filePath: string;
  title?: string;
  sections: DocumentSection[];
  rawText: string;
  pageCount?: number;
}

interface DocumentSection {
  heading?: string;
  content: string;
  pageNumber?: number;
  charStart: number;
  charEnd: number;
}
```

Implemented parsers:

| Parser      | Extensions          | Strategy                                              |
|-------------|---------------------|-------------------------------------------------------|
| Plaintext   | `.txt`              | Single section, full text passthrough                 |
| Markdown    | `.md`, `.markdown`  | Split by heading levels (#–######), preserves hierarchy |
| PDF         | `.pdf`              | `pdf-parse`, splits on page breaks (form-feed char)   |
| EPUB        | `.epub`             | `epub2`, extracts chapters, strips HTML, maps ToC headings |

### 4.3 Embedder

```typescript
interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
  modelId: string;
}
```

Implementation notes (Ollama adapter):
- Uses `/api/embed` endpoint
- Automatic retry with text truncation on context length errors (halves text, up to 4 attempts)
- Vectors normalized to unit length for cosine similarity
- 120-second timeout per request

### 4.4 Retriever

```typescript
interface Retriever {
  retrieve(query: string, options?: RetrievalOptions): Promise<RetrievalResult[]>;
}

interface RetrievalOptions {
  topK?: number;
  scoreThreshold?: number;
  documentFilter?: string[];
}

interface RetrievalResult {
  chunk: ChunkMetadata;
  score: number;
  highlights: TextHighlight[];
}

interface TextHighlight {
  text: string;
  start: number;
  end: number;
}
```

### 4.5 LLM Adapter (apps/web)

Separate from the α embedder — this handles chat completion with streaming:

```typescript
interface LLMAdapter {
  chat(messages: LLMMessage[], signal?: AbortSignal): AsyncIterable<LLMStreamEvent>;
  isAvailable(): Promise<boolean>;
}

type LLMStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; totalContent: string }
  | { type: 'error'; error: string };

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

Implementation: Ollama `/api/chat` with `stream: true`, NDJSON line parsing, abort signal
propagation for cancellation.

---

## 5. Hardware Presets

### 5.1 Pi 5 — `pi5`

Target: Raspberry Pi 5, 4-16 GB RAM, ARM64, no GPU.

| Parameter            | Value                  |
|----------------------|------------------------|
| Embedding model      | `all-minilm`           |
| Dimensions           | 384                    |
| Vector DB            | `sqlite-vec`           |
| Chunk size (tokens)  | 256                    |
| Chunk overlap        | 32                     |
| Top-K retrieval      | 3                      |
| Batch size           | 8                      |
| LLM model (suggest)  | `gemma3:1b`            |

### 5.2 M-Series Mac — `m-series`

Target: Apple Silicon Mac (M1-M5), 16-64 GB unified memory.

| Parameter            | Value                  |
|----------------------|------------------------|
| Embedding model      | `nomic-embed-text`     |
| Dimensions           | 768                    |
| Vector DB            | `sqlite-vec`           |
| Chunk size (tokens)  | 512                    |
| Chunk overlap        | 64                     |
| Top-K retrieval      | 5                      |
| Batch size           | 32                     |
| LLM model (suggest)  | `gemma3:4b`            |

### 5.3 GPU / Cloud — `gpu`

Target: NVIDIA GPU (8+ GB VRAM) or cloud instance.

| Parameter            | Value                  |
|----------------------|------------------------|
| Embedding model      | `mxbai-embed-large`    |
| Dimensions           | 1024                   |
| Vector DB            | `lancedb` or `qdrant`  |
| Chunk size (tokens)  | 512                    |
| Chunk overlap        | 64                     |
| Top-K retrieval      | 10                     |
| Batch size           | 64                     |
| LLM model (suggest)  | `llama3:8b`            |

### 5.4 Custom

All parameters are individually overridable in `config.yaml`. Presets are starting points.

---

## 6. Ingestion Pipeline

### 6.1 Process

```
1. Scan reference/ directory for supported file types
2. For each file:
   a. Compute content hash (SHA-256)
   b. Check hash against tracker DB
   c. If new or changed:
      i.   Select parser by file extension
      ii.  Parse → extract text + structure
      iii. Chunk → split into sized pieces with overlap
      iv.  Embed → compute vector for each chunk via Ollama
      v.   Store → upsert vectors + metadata into vector DB
      vi.  Update tracker with new hash
   d. If unchanged: skip
3. For tracked files no longer in reference/:
   a. Remove vectors from DB
   b. Remove from tracker
```

### 6.2 Tracker Schema (SQLite)

```sql
CREATE TABLE IF NOT EXISTS document_tracker (
  id            TEXT PRIMARY KEY,         -- SHA-256 hash of file path
  file_path     TEXT NOT NULL UNIQUE,     -- Path relative to reference/
  content_hash  TEXT NOT NULL,            -- SHA-256 of file content
  chunk_count   INTEGER NOT NULL,         -- Number of chunks produced
  embedding_model TEXT NOT NULL,          -- Model used for embeddings
  indexed_at    TEXT NOT NULL,            -- ISO timestamp
  file_size     INTEGER NOT NULL,         -- Bytes
  file_type     TEXT NOT NULL             -- Extension
);
```

### 6.3 Re-embedding

When the embedding model changes (e.g., switching from `all-minilm` to `nomic-embed-text`),
all documents must be re-embedded. The tracker records which model produced each document's
vectors. On startup or `aure ingest`, if the configured model differs from what's stored,
a full re-index is triggered automatically.

### 6.4 Chunking Strategies

**Semantic chunking** (default): splits on paragraph boundaries and section breaks. Falls
back to sentence-boundary splitting when a single block exceeds `maxTokens`. Respects
document structure — won't merge content across section headings.

**Fixed-size chunking** (fallback): word-boundary-aware splitting with configurable token
overlap. Uses token estimation (1 word ≈ 1.3 tokens). Supports `respectBoundaries` to
avoid splitting mid-sentence.

Both strategies produce `ChunkMetadata` with full provenance (file path, page number,
section heading, character offsets, chunk index, raw text).

### 6.5 Scanner

The ingestion scanner walks the `reference/` directory recursively, filtering by configured
`supportedTypes` (default: `.pdf`, `.md`, `.txt`, `.epub`). Returns file entries with path,
size, and extension for the pipeline to process.

---

## 7. Retrieval & Source Attribution

### 7.1 Query Flow

```
1. Receive user prompt
2. Embed the prompt using the same model as ingestion
3. Vector similarity search → top-k chunks (L2 distance → cosine conversion)
4. (Optional) Re-rank chunks using keyword overlap (0.7 semantic + 0.3 keyword blend)
5. Extract highlights — token overlap between query and chunk text
   (stopword filtering, adjacent match merging)
6. Return results with chunk metadata, scores, and highlights
```

### 7.2 Source Response Format

```typescript
interface RAGResponse {
  answer: string;
  sources: SourceCitation[];
  retrievalMeta: {
    chunksSearched: number;
    chunksUsed: number;
    queryEmbeddingTimeMs: number;
    searchTimeMs: number;
    totalTimeMs: number;
  };
}

interface SourceCitation {
  documentId: string;
  fileName: string;
  filePath: string;
  pageNumber?: number;
  sectionHeading?: string;
  relevanceScore: number;
  highlightedText: string;
  context: string;
  charStart: number;
  charEnd: number;
}
```

### 7.3 Highlight Extraction

Highlights are computed at retrieval time (not post-LLM). The process:

1. Tokenize query and chunk text into lowercase words
2. Filter out stopwords (common English words: "the", "is", "and", etc.)
3. Find matching tokens between query and chunk
4. Map matches back to character offsets in the chunk text
5. Merge adjacent/overlapping highlights into contiguous spans

The highlighted text is returned alongside each source citation. In the web UI, source
pills show the file name and score; hovering reveals the highlighted text.

### 7.4 Reranking

Optional keyword-based reranking blends semantic similarity with keyword overlap:

```
final_score = 0.7 × semantic_score + 0.3 × keyword_score
```

Keyword score is computed as Jaccard similarity between query tokens and chunk tokens
(both lowercased, stopwords removed). Disabled by default in all presets (`rerank: false`).

---

## 8. CLI

### 8.1 Commands

```
aure init [--preset <name>]     Set up config, pull models, create directories.
                                Presets: pi5, m-series, gpu, custom

aure ingest                     Process all new/changed files in reference/.
                                Flags: --force (re-embed everything)
                                       --dry-run (show what would be processed)

aure search "<query>"           Test retrieval without LLM.
                                Shows matched chunks, scores, sources, highlights.
                                Flags: --top-k <n>
                                       --threshold <score>
                                       --json (machine-readable output)

aure status                     Show index stats: documents, chunks, DB size,
                                model info, last ingestion time.

aure preset list                Show available presets with current active marked.

aure preset switch <name>       Switch preset, rewrite config, pull models.

aure preset pull                Pull Ollama models for current preset.
                                Flags: --embedding-only
                                       --llm-only
```

### 8.2 Init Workflow

```
$ aure init --preset pi5

  Aure α — RAG Engine Setup

  Preset: Pi 5 (ARM64, conservative memory)

  ✓ Created reference/ directory
  ✓ Created config.yaml with pi5 defaults
  ✓ Pulling embedding model: all-minilm...
    ████████████████████████████ 45 MB — done
  ✓ Initialized sqlite-vec database
  ✓ Ready. Drop documents into reference/ and run `aure ingest`.
```

---

## 9. Configuration

### 9.1 config.yaml Structure

```yaml
# Aure α configuration

preset: pi5                        # Base preset (values below override)

embedding:
  provider: ollama                  # Only ollama for now
  model: all-minilm                 # Embedding model name
  baseUrl: http://localhost:11434   # Ollama endpoint
  dimensions: 384                   # Must match model output
  batchSize: 8                      # Texts per embedding call

vectordb:
  adapter: sqlite-vec               # sqlite-vec | lancedb | qdrant
  path: ./aure-vectors.db           # For embedded DBs
  # url: http://localhost:6333      # For client-server DBs (qdrant)

chunking:
  strategy: semantic                # semantic | fixed
  maxTokens: 256                    # Max tokens per chunk
  overlap: 32                       # Token overlap between chunks
  respectBoundaries: true           # Don't split mid-sentence

retrieval:
  topK: 3                           # Chunks to retrieve per query
  scoreThreshold: 0.3               # Minimum similarity score
  rerank: false                     # Enable re-ranking pass

reference:
  path: ./reference                 # Document folder
  watch: false                      # Auto-ingest on file changes
  supportedTypes:                   # File extensions to process
    - .pdf
    - .md
    - .txt
    - .epub

llm:
  model: gemma3:1b                  # LLM for chat (used by apps/web)

server:
  port: 3001                        # HTTP server port
  host: 0.0.0.0
```

---

## 10. Chat Application (apps/web)

### 10.1 Overview

The `apps/web` package is a complete chat application that wires α's retrieval engine to
an Ollama LLM with a web UI. It demonstrates the "library mode" integration — importing
α's config loader, embedder, vector DB, and retriever directly.

### 10.2 Architecture

```
apps/web/
├── src/
│   ├── index.ts                    # Entry: loads α config, boots all components
│   ├── chat/
│   │   ├── responder.ts            # RAG retrieval → context building → LLM stream
│   │   └── jobs.ts                 # Background job processor with cancellation
│   ├── db/
│   │   ├── schema.ts              # conversations + messages tables
│   │   └── index.ts               # ChatDB CRUD operations
│   ├── llm/
│   │   ├── types.ts               # LLMAdapter, LLMMessage, LLMStreamEvent
│   │   └── ollama.ts              # Ollama /api/chat streaming adapter
│   ├── persona/
│   │   ├── default.ts             # Default persona (name, system prompt, greeting)
│   │   └── loader.ts              # YAML persona loader with {{name}} substitution
│   ├── server/
│   │   ├── api.ts                 # Hono routes (REST + SSE + static files)
│   │   └── sse.ts                 # SSE manager (per-conversation event streaming)
│   └── types/
│       └── index.ts               # Conversation, Message, SourceRef, Persona
├── public/
│   ├── index.html                 # Minimal shell
│   ├── chat.js                    # Vanilla JS client (SSE-driven)
│   └── style.css                  # Chat styling
└── persona.yaml                   # User persona configuration
```

### 10.3 Responder Pipeline

The responder is the bridge between α and the LLM. For each visitor message:

1. Gather all unresponded visitor messages in the conversation
2. Combine them into a single query string
3. Call `retriever.retrieve(query)` → get top-k chunks with sources
4. Build context block: `[Source N: filename > §heading (p.X)]\nchunk text`
5. Assemble LLM messages:
   - Single system message: persona.systemPrompt + persona.instructions + context block
   - Conversation history (visitor → user, assistant → assistant)
6. Stream Ollama response via SSE tokens to the browser
7. On completion: save message content + source references to chat DB

Design choice: system prompt, instructions, and RAG context are merged into a single
system message because small models (gemma3:1b) handle one system message better than
multiple system/context blocks.

### 10.4 Job Processor

Non-blocking message handling with auto-chaining:

- Visitor sends message → enqueue job → return 201 immediately
- Background: run responder → stream tokens via SSE
- If new visitor messages arrive during processing, auto-chain another run
- Cancellation via AbortController propagated to Ollama fetch

### 10.5 API Endpoints

**Chat:**
```
POST   /api/conversations              Create conversation (returns greeting)
GET    /api/conversations/:id          Get conversation with messages
POST   /api/conversations/:id/messages Send visitor message (enqueues job)
POST   /api/conversations/:id/cancel   Cancel pending response
GET    /api/conversations/:id/stream   SSE event stream
```

**Reference files:**
```
GET    /api/reference/*                Serve source documents (PDF inline, others download)
                                       Path traversal protection included
```

**Health:**
```
GET    /api/health                     { status: "ok"|"degraded", ollama: bool }
```

### 10.6 SSE Events

```
message:start       { messageId }                        — placeholder created
message:token       { messageId, token }                 — streaming chunk
message:done        { messageId, content, sources }      — complete with sources
message:error       { messageId, error }                 — LLM or system error
message:cancelled   { messageId }                        — user cancelled
```

### 10.7 Chat Database Schema

```sql
conversations (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT 'New conversation',
  created_at TEXT DEFAULT datetime('now'),
  updated_at TEXT DEFAULT datetime('now')
)

messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('visitor', 'assistant', 'system')),
  content TEXT DEFAULT '',
  status TEXT CHECK (status IN ('pending', 'streaming', 'done', 'error', 'cancelled')),
  sources TEXT DEFAULT '[]',       -- JSON array of SourceRef
  created_at TEXT DEFAULT datetime('now')
)
```

Sources are stored as a JSON column on each assistant message, carrying:
`fileName`, `filePath`, `pageNumber`, `sectionHeading`, `score`, `highlightedText`.

### 10.8 Web Frontend

Vanilla HTML/JS/CSS — no build step, no framework. Features:

- SSE-driven real-time streaming (tokens appear as they arrive)
- Source pills below each response (clickable → opens source file via `/api/reference/`)
- Score percentage on each source pill
- Hover on pill → shows highlighted text excerpt
- Cancel button during streaming
- Auto-resizing textarea
- Enter to send, Shift+Enter for newline
- New conversation button

### 10.9 Persona System

YAML-based persona with `{{name}}` template substitution:

```yaml
name: Aure
systemPrompt: "You are {{name}}, a helpful document assistant..."
instructions: "Additional private instructions..."
greeting: "Hello! I'm {{name}}. I can answer questions about..."
```

Defaults to a document-assistant persona that instructs the LLM to cite sources by number
and only admit ignorance when context is completely unrelated.

---

## 11. Vector DB Schema (sqlite-vec)

### 11.1 Tables

```sql
-- Virtual vector table
CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
  embedding float[<dimensions>]      -- 384 / 768 / 1024 depending on preset
);

-- Metadata joined by rowid
CREATE TABLE IF NOT EXISTS chunk_metadata (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  page_number INTEGER,
  section_heading TEXT,
  char_start INTEGER NOT NULL,
  char_end INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  vec_rowid INTEGER NOT NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_chunk_document ON chunk_metadata(document_id);
CREATE INDEX IF NOT EXISTS idx_chunk_vec ON chunk_metadata(vec_rowid);
```

### 11.2 Search Implementation

Vector search uses L2 distance from sqlite-vec, converted to cosine similarity:
```
cosine_similarity = 1 - (l2_distance² / 2)
```

This works because vectors are normalized to unit length during embedding.

---

## 12. Technology Stack

| Layer               | Technology              | Status | Rationale                                |
|---------------------|-------------------------|--------|------------------------------------------|
| Language            | TypeScript (Node.js ≥20)| ✅     | Consistent with Aure v1, strong typing   |
| HTTP framework      | Hono                    | ✅     | Lightweight, fast (apps/web)             |
| Embeddings          | Ollama `/api/embed`     | ✅     | Already deployed, embedding models       |
| LLM                 | Ollama `/api/chat`      | ✅     | Streaming, local, no cloud               |
| Vector DB (default) | sqlite-vec              | ✅     | Zero-process, ARM64, file-based          |
| Vector DB (alt)     | LanceDB                 | ❌     | Better for larger datasets, embedded     |
| Vector DB (alt)     | Qdrant                  | ❌     | Full-featured, cloud/GPU deployments     |
| PDF parsing         | pdf-parse               | ✅     | Lightweight, pure JS                     |
| EPUB parsing        | epub2                   | ✅     | Chapter extraction, ToC mapping          |
| Markdown parsing    | Native                  | ✅     | Heading-based section splitting          |
| CLI framework       | citty                   | ✅     | Lightweight, TypeScript-native           |
| Testing             | vitest                  | ✅     | Fast, TypeScript-native                  |
| Config              | YAML (yaml package)     | ✅     | Consistent with Aure v1                  |
| File watching       | chokidar                | ❌     | Cross-platform, battle-tested            |
| SQLite              | better-sqlite3          | ✅     | WAL mode, foreign keys, both DBs        |

---

## 13. Integration Modes

### 13.1 Library Mode (implemented — apps/web uses this)

```typescript
import {
  loadConfig,
  createEmbedder,
  createVectorDB,
  createRetriever,
} from '@aure/alpha';

const config = loadConfig('./config.yaml');
const embedder = createEmbedder(config.embedding);
const { adapter } = await createVectorDB(config.vectordb, config.embedding.dimensions);
await adapter.initialize();
const retriever = createRetriever(embedder, adapter, config.retrieval);

const results = await retriever.retrieve(userMessage);
// results[].chunk.text, results[].score, results[].highlights
```

### 13.2 Service Mode (planned — Phase 4)

Run α as a separate HTTP process, query via REST:

```
apps/web (port 3000) ──HTTP──▶ α API (port 3001)
```

---

## 14. Implementation Phases

### Phase 1 — Foundation ✅

Core types, config loader, preset system. CLI scaffolding with `init`, `status`, and
`preset` commands. Library export structure.

### Phase 2 — Ingestion ✅

Parsers (PDF, Markdown, plaintext, EPUB), semantic + fixed chunkers, Ollama embedder,
document tracker with SHA-256 hashing. sqlite-vec adapter. Ingestion pipeline with
`--dry-run` and `--force` flags. Incremental indexing with model mismatch detection.

### Phase 3 — Retrieval + Chat App ✅

Similarity search, retrieval with highlights and optional reranking. CLI `search` command.
Full chat application (`apps/web`) with Hono API, SSE streaming, conversation DB, persona
system, source attribution in UI, and vanilla JS frontend.

### Phase 4 — α Standalone API

HTTP endpoints on the α side for search, ingestion triggering, document listing, and stats.
Enables service-mode integration without importing α as a library.

```
POST /api/search                    Retrieve chunks for a query
POST /api/ingest                    Trigger ingestion (with force/dry-run)
GET  /api/ingest/status             Ingestion progress
GET  /api/documents                 List indexed documents
DELETE /api/documents/:id           Remove document from index
GET  /api/stats                     Index statistics
```

### Phase 5 — Extended Adapters & Features

- **LanceDB adapter**: embedded columnar vector DB, good for medium datasets.
- **Qdrant adapter**: client-server vector DB for cloud/GPU deployments.
- **File watcher**: `chokidar`-based auto-ingestion when `reference/` changes.
- **`aure serve` CLI command**: start the α API server.
- **`aure ingest --watch`**: stay running, watch for file changes.
- **Performance benchmarks**: timing across all three hardware presets.

### Phase 6 — Advanced Retrieval

- **Conversation-aware retrieval**: use full conversation history (not just latest message)
  to build a richer query embedding. Possibly summarize conversation before embedding.
- **Cross-encoder reranking**: replace keyword reranking with a small cross-encoder model
  for higher quality relevance scoring.
- **Hybrid search**: combine vector similarity with BM25 keyword search for better recall.
- **Multi-language embeddings**: evaluate multilingual embedding models for EN/RU/ET support
  (Aure v1's language scope).

### Phase 7 — Admin & Observability

- **Admin API**: conversation listing, message review, spam flagging (port from Aure v1).
- **Ingestion logs**: track parse errors, embedding failures, timing per document.
- **Retrieval analytics**: log which documents get retrieved most, low-score queries,
  queries with no relevant results.
- **Web admin panel**: dashboard for index health, recent conversations, document management.

---

## 15. Open Questions

### Resolved

- **Chunk overlap strategy**: both fixed and sentence-boundary-aware are implemented.
  Semantic chunking is the default; fixed is the fallback.
- **EPUB support**: implemented as a fourth parser. Was listed as "future" in design
  principles; shipped in Phase 2.
- **CLI framework**: settled on `citty` (lightweight, TypeScript-native).

### Still Open

- **Multi-language embeddings**: Aure v1 supports EN/RU/ET. `all-minilm` is English-biased.
  `nomic-embed-text` handles multilingual better but is larger. Should the Pi 5 preset
  sacrifice speed for multilingual quality? Or should language be a separate config axis?
- **Image extraction from PDFs**: OCR is heavy on Pi. Defer to a future phase or make it
  opt-in for GPU preset only?
- **Conversation context in retrieval**: should the retriever consider the full conversation
  history when building the query embedding? The responder already combines unresponded
  messages, but earlier turns are ignored for retrieval (only used for LLM history).
- **Vector quantization**: int8 instead of float32 would cut storage 4× and speed up search
  on Pi. sqlite-vec supports this. Worth the quality tradeoff for the Pi preset?
- **DOCX parser**: Microsoft Word documents are common in knowledge bases. Worth adding as
  a parser? Would need `mammoth` or similar dependency.
- **HTML parser**: web pages / saved articles. Trivial to strip tags but needs good
  boilerplate removal (readability-style extraction).
- **Reference folder web upload**: should the web UI allow uploading documents directly to
  `reference/` and triggering re-ingestion? Would need multipart upload endpoint + auth.
- **Streaming retrieval metadata**: currently sources are attached at `message:done`.
  Should retrieval results be sent earlier (before LLM starts streaming) so the UI can
  show "searching..." → "found 3 sources" → streaming response?
