# Aure α

RAG engine for Aure. Local-first, hardware-aware retrieval with source attribution.

Documents go into `reference/`. The system ingests them — parsing, chunking, embedding, and storing vectors in sqlite-vec. At query time, only the most relevant chunks are retrieved, each carrying full provenance (file, page, section, character offsets).

## Setup

```bash
npm install
```

Requires [Ollama](https://ollama.com) running locally. Models are pulled automatically when switching presets, or manually:

```bash
npm run aure -- preset pull
```

## Usage

All CLI commands use `npm run aure --`:

```bash
# Initialize config and reference/ directory
npm run aure -- init --preset m-series

# Pull models for current preset (or specify one)
npm run aure -- preset pull
npm run aure -- preset pull m-series

# Switch between presets (pulls models automatically)
npm run aure -- preset switch pi5
npm run aure -- preset switch m-series --skip-pull

# List available presets
npm run aure -- preset list

# Place documents in reference/
cp docs/*.md reference/
cp papers/*.pdf reference/

# Ingest documents into the vector store
npm run aure -- ingest
npm run aure -- ingest --force    # re-embed everything

# Check index status
npm run aure -- status

# Search without LLM
npm run aure -- search "how does authentication work"
npm run aure -- search "error handling" --top-k 3 --threshold 0.5
npm run aure -- search "deployment" --json
```

## Hardware Presets

| Preset | Embedding Model | Dimensions | Chunk Size | Top-K |
|--------|----------------|------------|------------|-------|
| `pi5` | all-minilm | 384 | 256 tokens | 3 |
| `m-series` | nomic-embed-text | 768 | 512 tokens | 5 |
| `gpu` | mxbai-embed-large | 1024 | 512 tokens | 10 |

## Library Usage

```typescript
import {
  loadConfig,
  createPipeline,
  createEmbedder,
  createVectorDB,
  createRetriever,
} from '@aure/alpha';

const config = loadConfig('./config.yaml');

// Ingest
const pipeline = createPipeline(config);
await pipeline.ingest();
await pipeline.close();

// Retrieve
const embedder = createEmbedder(config.embedding);
const { adapter, db } = await createVectorDB(config.vectordb, config.embedding.dimensions);
await adapter.initialize();

const retriever = createRetriever(embedder, adapter, config.retrieval);
const results = await retriever.retrieve('your query here');

db.close();
```

## Project Structure

```
src/
  cli/          CLI commands (init, ingest, status, search, preset)
  config/       YAML config loader, hardware presets, validation
  parsers/      Document parsers (plaintext, markdown, PDF)
  chunker/      Text chunking (fixed-size, semantic)
  embedder/     Embedding via Ollama
  vectordb/     Vector storage (sqlite-vec)
  ingestion/    Pipeline orchestration, file tracking
  retriever/    Query retrieval, highlights, reranking
  types/        TypeScript interfaces
```

## Development

```bash
npm test            # Run tests
npm run test:watch  # Watch mode
npx tsc --noEmit    # Type-check
```
