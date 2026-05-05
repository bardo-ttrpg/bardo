# Bardo

Bardo is a local-first toolkit for running tabletop roleplaying campaigns from durable workspace truth instead of fragile chat memory.

The public `bardo` repository is the open-source home for Bardo's community-facing tools, docs, engine work, and MCP integration. The private `bardo-app` repository is reserved for hosted product code, billing, customer data paths, deployment configuration, and other business-sensitive work.

## Who It Is For

- Game masters who want campaign tools that remember the right things.
- TTRPG groups that prefer durable notes, rules, and session state over one-off chat transcripts.
- Developers interested in local-first RPG tooling, Model Context Protocol servers, and AI-assisted campaign workflows.
- Contributors who want to help build a clear, safe, welcoming open-source TTRPG toolchain.

## What Is Here

- `packages/bardo-engine`: shared campaign and game-system logic.
- `packages/bardo-mcp`: the Bardo MCP server and release tooling.
- `packages/bardo-shared`: shared types and helpers.
- `website`: the public website and docs experience.
- `docs`: runbooks, release checklists, and operational notes.

## Quick Start

Install dependencies:

```bash
bun install
```

Run the website:

```bash
bun run dev
```

Run checks before opening a pull request:

```bash
bun run check
bun run test
```

## Contributing

Issues are for actionable work: bugs, features, docs, release tasks, and security-hardening tasks. Questions, ideas, showcases, playtesting stories, and general community conversation belong in GitHub Discussions.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), then open an issue before starting larger work.

## Security

Please do not report vulnerabilities in public issues. Read [SECURITY.md](SECURITY.md) for the private reporting flow.

## License

Code in this repository is licensed under the [MIT License](LICENSE). Bardo names, branding, logos, lore, setting text, art, and other creative content are not granted under the MIT code license; see [CONTENT_LICENSE.md](CONTENT_LICENSE.md).
