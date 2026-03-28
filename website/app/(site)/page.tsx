import {
	buildFramerTemplateMetadata,
	FramerTemplatePage,
} from "./_components/framer-template-page";

export async function generateMetadata() {
	return buildFramerTemplateMetadata("index.html");
}

export default async function SitePage() {
	return <FramerTemplatePage relativePath="index.html" />;
}
