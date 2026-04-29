# Tool Behavior

Bardo's public MCP surface is intentionally small. It is designed to help an agent prepare and maintain local campaign truth without turning every chat response into permanent canon.

## Public Capabilities

Bardo helps an agent:

- Check whether the workspace is initialized and ready.
- Prepare local campaign artifacts from rulebook and campaign inputs.
- Resolve scene turns using grounded local context.
- Record explicit table corrections.
- Commit validated state changes.
- Stop safely when required context is missing.

## Safety Model

Narration alone is not canon. Durable truth should come from grounded source material, validated local state-changing events, or explicit user correction.

If Bardo reports that the workspace is not ready, the agent should ask for missing information or run setup instead of inventing lore.
