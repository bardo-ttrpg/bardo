type ClientChunk = {
	path: string;
	bytes: number;
	contents: string;
};

type BundleAuditInput = {
	analyzeArtifacts: string[];
	clientChunks: ClientChunk[];
};

type BundleAuditResult = {
	errors: string[];
	warnings: string[];
	summary: {
		totalClientChunkBytes: number;
		clientChunkCount: number;
	};
};

function isPublicChunk(chunk: ClientChunk): boolean {
	const source = `${chunk.path}\n${chunk.contents}`;
	const normalized = chunk.path.replaceAll("\\", "/").toLowerCase();
	return (
		normalized.includes("app-home") ||
		normalized.includes("app-blog") ||
		normalized.includes("app-docs") ||
		normalized.includes("app-legal") ||
		normalized.includes("/(site)/page") ||
		normalized.includes("/(site)/blog/") ||
		normalized.includes("/(site)/(public-secondary)/blog/") ||
		normalized.includes("/(site)/docs/") ||
		normalized.includes("/(site)/legal/") ||
		normalized.includes("/(site)/(public-secondary)/legal/") ||
		source.includes("app/(site)/page") ||
		source.includes("app/(site)/blog/") ||
		source.includes("app/(site)/(public-secondary)/blog/") ||
		source.includes("app/(site)/docs/") ||
		source.includes("app/(site)/legal/") ||
		source.includes("app/(site)/(public-secondary)/legal/")
	);
}

export function auditBundleArtifacts(
	input: BundleAuditInput,
): BundleAuditResult {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (input.analyzeArtifacts.length === 0) {
		if (input.clientChunks.length === 0) {
			errors.push(
				"Missing Next bundle analyzer artifacts. Run the audit through an ANALYZE=true build.",
			);
		} else {
			warnings.push(
				"Next bundle analyzer artifacts were missing, so the audit used generated client chunks only.",
			);
		}
	}

	for (const chunk of input.clientChunks) {
		if (
			chunk.contents.includes("@bardo/mcp") ||
			chunk.contents.includes("/packages/bardo-mcp/")
		) {
			errors.push(`Client bundle leaked @bardo/mcp into ${chunk.path}.`);
		}

		if (!isPublicChunk(chunk)) {
			continue;
		}

		if (
			chunk.contents.includes("@clerk/nextjs") ||
			chunk.contents.includes("__clerk")
		) {
			warnings.push(
				`Public route chunk ${chunk.path} includes Clerk runtime code.`,
			);
		}

		if (chunk.contents.includes("framer-motion")) {
			warnings.push(`Public route chunk ${chunk.path} includes framer-motion.`);
		}
	}

	return {
		errors,
		warnings,
		summary: {
			totalClientChunkBytes: input.clientChunks.reduce(
				(total, chunk) => total + chunk.bytes,
				0,
			),
			clientChunkCount: input.clientChunks.length,
		},
	};
}
