import type { Metadata } from "next";
import { loadFramerTemplatePage } from "@/lib/framer-template";
import FramerTemplateEnhancer from "./framer-template-enhancer";

export async function buildFramerTemplateMetadata(relativePath: string) {
	const template = await loadFramerTemplatePage(relativePath);

	const metadata: Metadata = {};

	if (template.title) {
		metadata.title = {
			absolute: template.title,
		};
	}

	if (template.description) {
		metadata.description = template.description;
	}

	return metadata;
}

export async function FramerTemplatePage({
	relativePath,
}: {
	relativePath: string;
}) {
	const template = await loadFramerTemplatePage(relativePath);

	return (
		<>
			{template.styleBlocks.map((styleBlock, index) => (
				<div
					key={`${relativePath}-style-${index}`}
					suppressHydrationWarning
					dangerouslySetInnerHTML={{ __html: styleBlock }}
				/>
			))}
			<div
				suppressHydrationWarning
				dangerouslySetInnerHTML={{ __html: template.bodyHtml }}
			/>
			<FramerTemplateEnhancer />
		</>
	);
}
