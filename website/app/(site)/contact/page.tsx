import {
	buildFramerTemplateMetadata,
	FramerTemplatePage,
} from "../_components/framer-template-page";

export async function generateMetadata() {
	return buildFramerTemplateMetadata("contact/index.html");
}

export default async function ContactPage() {
	return <FramerTemplatePage relativePath="contact/index.html" />;
}
