import type { Metadata } from "next";
import { generateStaticParamsFor, importPage } from "nextra/pages";
import { cache } from "react";
import { useMDXComponents } from "../../../mdx-components";

export const generateStaticParams = generateStaticParamsFor("mdxPath");
export const dynamicParams = false;

const importPageCached = cache((pathKey: string) =>
	importPage(pathKey.length > 0 ? pathKey.split("/") : []),
);

type MdxPageProps = {
	params: Promise<{ mdxPath?: string[] }>;
};

export async function generateMetadata(props: MdxPageProps): Promise<Metadata> {
	const params = await props.params;
	const pathKey = (params.mdxPath ?? []).join("/");
	const { metadata } = await importPageCached(pathKey);
	return metadata as Metadata;
}

export default async function MdxPage(props: MdxPageProps) {
	const params = await props.params;
	const pathKey = (params.mdxPath ?? []).join("/");
	const {
		default: MDXContent,
		toc,
		metadata,
		sourceCode,
	} = await importPageCached(pathKey);
	const Wrapper = useMDXComponents().wrapper;

	return Wrapper ? (
		<Wrapper toc={toc} metadata={metadata} sourceCode={sourceCode}>
			<MDXContent params={params} />
		</Wrapper>
	) : (
		<MDXContent params={params} />
	);
}
