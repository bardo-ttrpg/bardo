# Client Support

Bardo publishes as a local stdio MCP server. Client support means Bardo can write or document a local MCP configuration for that client. It does not mean every release has been manually live-smoked in every client.

## Compatibility matrix

| Client | Public status | Notes |
| --- | --- | --- |
| Codex | Supported, smoke required per release | Official MCP config support exists; Bardo writes Codex config. |
| OpenCode | Supported, smoke required per release | Official local MCP config support exists; Bardo writes OpenCode config. |
| Claude Code/Desktop | Supported, smoke required per release | Official project MCP config support exists; Bardo writes `.mcp.json`. |
| Gemini CLI | Supported, smoke required per release | Official MCP settings support exists; Bardo writes Gemini settings. |
| Cursor | Config-supported | Bardo writes Cursor MCP config; keep labeled this way until the current release is live-smoked in Cursor. |
| VS Code/GitHub Copilot | Config-supported | Bardo has an adapter, but this is not promoted until live-smoked. |
| Windsurf | Config-supported | Bardo has an adapter, but this is not promoted until live-smoked. |
| Kiro | Config-supported | Bardo has an adapter, but this is not promoted until live-smoked. |
| Kilo Code | Config-supported | Bardo has an adapter, but this is not promoted until live-smoked. |
| Trae | Experimental | Not publicly promoted until official docs and live smoke are verified. |

`auto` is not a client. It is a CLI convenience that detects exactly one existing supported config file in the current workspace.
