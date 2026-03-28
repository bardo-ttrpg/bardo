import {
	buildFramerTemplateMetadata,
	FramerTemplatePage,
} from "../_components/framer-template-page";

export async function generateMetadata() {
	return buildFramerTemplateMetadata("privacy-policy/index.html");
}

export default async function PrivacyPolicyPage() {
	return <FramerTemplatePage relativePath="privacy-policy/index.html" />;
}
