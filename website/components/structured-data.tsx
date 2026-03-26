type StructuredDataProps = {
	data: Record<string, unknown>;
};

export default function StructuredData({ data }: StructuredDataProps) {
	return <script type="application/ld+json">{JSON.stringify(data)}</script>;
}
