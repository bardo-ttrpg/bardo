# Bardo - MCP Filesystem Server PRD

## Overview
Bardo is a Model Context Protocol (MCP) backend server that enables AI agents and players to interact with a persistent RPG-like world. Campaign data is stored as markdown files with YAML frontmatter, providing multi-tenant isolation via API key authentication.

## Core Features

### 1. Health Check Endpoint
- **GET /health** returns server status, auth configuration, and API key count
- No authentication required
- Returns JSON with `status`, `authRequired`, and `configuredApiKeys` fields

### 2. MCP Session Management
- **POST /mcp** creates new sessions or routes requests to existing sessions
- **GET /mcp** retrieves data from existing sessions (requires mcp-session-id header)
- **DELETE /mcp** closes existing sessions (requires mcp-session-id header)
- **OPTIONS /mcp** handles CORS preflight requests
- Sessions are stored in-memory with UUID-based session IDs
- Session isolation: prevents reuse across different API keys

### 3. Authentication System
- API keys configured via `BARDO_API_KEYS_JSON` environment variable
- Each API key maps to a campaign directory path
- Key sources (in order): `x-api-key` header, `Authorization: Bearer` header, `?apiKey` query param
- Default API key support for localhost via `BARDO_DEFAULT_API_KEY`
- No-auth mode when `BARDO_API_KEYS_JSON` is not set

### 4. MCP Tool: init
- Initializes the bardo workspace directory structure
- Creates subdirectories: rules, party, entities, items, world, quests, state
- Idempotent - safe to call multiple times

### 5. MCP Tool: markdown_read
- Reads markdown files from the bardo workspace
- Parses YAML frontmatter and body content
- Path validation prevents directory traversal

### 6. MCP Tool: markdown_upsert
- Creates or updates markdown files
- Supports merge strategies: replace, append, prepend
- Preserves frontmatter fields (title, description)

### 7. MCP Tool: player_action (Primary)
- Processes natural language player actions
- Auto-detects intent: travel, explore, social, rest, combat, general
- Advances world time based on action type (15-480 minutes)
- Auto-creates location files and spawns ambient NPCs
- Updates campaign state and action history

### 8. MCP Tool: state_get
- Reads campaign state from markdown file
- Parses JSON body into structured state object
- Default path: state/current.md

### 9. MCP Tool: state_set
- Writes campaign state as JSON in markdown body
- Includes frontmatter metadata
- Pretty-printed JSON output

## Non-Functional Requirements
- CORS support for all origins
- Path safety: prevents directory traversal attacks
- Multi-tenant: per-API-key campaign directory isolation
- File-based persistence (no database)
- Runs on Bun runtime on port 3000 (configurable via PORT env)
