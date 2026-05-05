import { access } from "node:fs/promises";

const requiredDocs = [
	"../content/docs/index.mdx",
	"../content/docs/install.mdx",
	"../content/docs/connect-client.mdx",
	"../content/docs/mcp-surface.mdx",
];

await Promise.all(
	requiredDocs.map((docPath) => access(new URL(docPath, import.meta.url))),
);
