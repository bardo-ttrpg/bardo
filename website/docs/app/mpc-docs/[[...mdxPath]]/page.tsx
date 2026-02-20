import type { Metadata } from "next";
import { generateStaticParamsFor, importPage } from "nextra/pages";
import { cache } from "react";

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
	const { default: MDXContent } = await importPageCached(pathKey);
	return <MDXContent params={params} />;
}
