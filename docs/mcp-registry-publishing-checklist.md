# MCP Registry Publishing Checklist

- Keep `packages/mcp/server.json#name` equal to `io.github.bardo-ttrpg/bardo`.
- Publish public packages from the `@bardo-ttrpg/*` npm scope.
- Verify the stdio command is `bardo-mcp mcp serve`.
- Include only MIT-licensed local tooling, docs, examples, and marketplace metadata.
- Exclude SaaS app source, Clerk secrets, Convex secrets, paid entitlement logic, and private blog content.
