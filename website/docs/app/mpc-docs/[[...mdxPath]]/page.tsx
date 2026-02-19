import type { Metadata } from "next";
import { generateStaticParamsFor, importPage } from "nextra/pages";
import { useMDXComponents } from "../../../mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");

type MdxPageProps = {
	params: Promise<{ mdxPath?: string[] }>;
};

export async function generateMetadata(props: MdxPageProps): Promise<Metadata> {
	const params = await props.params;
	const { metadata } = await importPage(params.mdxPath ?? []);
	return metadata as Metadata;
}

export default async function MdxPage(props: MdxPageProps) {
	const params = await props.params;
	const {
		default: MDXContent,
		toc,
		metadata,
		sourceCode,
	} = await importPage(params.mdxPath ?? []);
	const Wrapper = useMDXComponents().wrapper;

	return Wrapper ? (
		<Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
			<MDXContent params={params} />
		</Wrapper>
	) : (
		<MDXContent params={params} />
	);
}
