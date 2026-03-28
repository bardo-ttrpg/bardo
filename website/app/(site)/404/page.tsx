import {
	buildFramerTemplateMetadata,
	FramerTemplatePage,
} from "../_components/framer-template-page";

export async function generateMetadata() {
	return buildFramerTemplateMetadata("404/index.html");
}

export default async function Template404Page() {
	return <FramerTemplatePage relativePath="404/index.html" />;
}
