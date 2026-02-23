type MetricLabelValue = string | number | boolean | null | undefined;
type MetricLabels = Record<string, MetricLabelValue>;

type CounterSeries = {
	labels: Record<string, string>;
	value: number;
};

type HistogramSeries = {
	labels: Record<string, string>;
	bucketCounts: number[];
	sum: number;
	count: number;
};

type CounterMetric = {
	type: "counter";
	help: string;
	series: Map<string, CounterSeries>;
};

type HistogramMetric = {
	type: "histogram";
	help: string;
	buckets: number[];
	series: Map<string, HistogramSeries>;
};

type MetricDefinition = CounterMetric | HistogramMetric;

const DEFAULT_HISTOGRAM_BUCKETS = [
	5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000,
] as const;

function normalizeLabelKey(key: string): string {
	const normalized = key
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "");
	return normalized || "label";
}

function normalizeLabelValue(value: MetricLabelValue): string {
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			return "unknown";
		}
		return String(value);
	}

	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}

	if (typeof value !== "string") {
		return "unknown";
	}

	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, "_")
		.replace(/[^a-z0-9_:/.+-]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "");

	if (!normalized) {
		return "unknown";
	}

	return normalized.slice(0, 120);
}

function normalizeLabels(labels: MetricLabels = {}): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(labels)) {
		normalized[normalizeLabelKey(key)] = normalizeLabelValue(value);
	}
	return normalized;
}

function labelKeyFromLabels(labels: Record<string, string>): string {
	const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
	if (entries.length === 0) {
		return "";
	}
	return entries.map(([key, value]) => `${key}=${value}`).join("|");
}

function escapePrometheusLabel(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/\n/g, "\\n")
		.replace(/"/g, '\\"');
}

function formatLabels(labels: Record<string, string>): string {
	const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
	if (entries.length === 0) {
		return "";
	}
	const body = entries
		.map(([key, value]) => `${key}="${escapePrometheusLabel(value)}"`)
		.join(",");
	return `{${body}}`;
}

function formatNumber(value: number): string {
	if (Number.isInteger(value)) {
		return String(value);
	}
	return String(Number(value.toFixed(6)));
}

function withLeLabel(
	labels: Record<string, string>,
	le: string,
): Record<string, string> {
	return {
		...labels,
		le,
	};
}

function sortBucketsAscending(buckets: readonly number[]): number[] {
	return [...buckets]
		.filter((bucket) => Number.isFinite(bucket) && bucket > 0)
		.map((bucket) => Math.floor(bucket * 1000) / 1000)
		.sort((a, b) => a - b);
}

export class MetricsRegistry {
	private readonly definitions = new Map<string, MetricDefinition>();

	registerCounter(name: string, options?: { help?: string }): void {
		const existing = this.definitions.get(name);
		if (existing) {
			if (existing.type !== "counter") {
				throw new Error(
					`Metric ${name} is already registered as ${existing.type}.`,
				);
			}
			if (options?.help && !existing.help) {
				existing.help = options.help;
			}
			return;
		}

		this.definitions.set(name, {
			type: "counter",
			help: options?.help ?? "",
			series: new Map(),
		});
	}

	registerHistogram(
		name: string,
		options?: { help?: string; buckets?: readonly number[] },
	): void {
		const existing = this.definitions.get(name);
		if (existing) {
			if (existing.type !== "histogram") {
				throw new Error(
					`Metric ${name} is already registered as ${existing.type}.`,
				);
			}
			if (options?.help && !existing.help) {
				existing.help = options.help;
			}
			return;
		}

		const buckets = sortBucketsAscending(
			options?.buckets ?? DEFAULT_HISTOGRAM_BUCKETS,
		);
		if (buckets.length === 0) {
			throw new Error(
				`Metric ${name} requires at least one positive histogram bucket.`,
			);
		}

		this.definitions.set(name, {
			type: "histogram",
			help: options?.help ?? "",
			buckets,
			series: new Map(),
		});
	}

	inc(name: string, labels: MetricLabels = {}, value = 1): void {
		if (!Number.isFinite(value)) {
			return;
		}

		const existing = this.definitions.get(name);
		if (!existing) {
			this.registerCounter(name);
		}

		const definition = this.definitions.get(name);
		if (!definition || definition.type !== "counter") {
			throw new Error(`Metric ${name} is not a counter.`);
		}

		const normalizedLabels = normalizeLabels(labels);
		const key = labelKeyFromLabels(normalizedLabels);
		const current = definition.series.get(key);
		if (current) {
			current.value += value;
			return;
		}

		definition.series.set(key, {
			labels: normalizedLabels,
			value,
		});
	}

	observe(name: string, value: number, labels: MetricLabels = {}): void {
		if (!Number.isFinite(value) || value < 0) {
			return;
		}

		const existing = this.definitions.get(name);
		if (!existing) {
			this.registerHistogram(name);
		}

		const definition = this.definitions.get(name);
		if (!definition || definition.type !== "histogram") {
			throw new Error(`Metric ${name} is not a histogram.`);
		}

		const normalizedLabels = normalizeLabels(labels);
		const key = labelKeyFromLabels(normalizedLabels);
		let current = definition.series.get(key);
		if (!current) {
			current = {
				labels: normalizedLabels,
				bucketCounts: new Array(definition.buckets.length + 1).fill(0),
				sum: 0,
				count: 0,
			};
			definition.series.set(key, current);
		}

		for (let index = 0; index < definition.buckets.length; index += 1) {
			const bucket = definition.buckets[index];
			if (bucket === undefined) {
				continue;
			}
			if (value <= bucket) {
				const currentCount = current.bucketCounts[index] ?? 0;
				current.bucketCounts[index] = currentCount + 1;
			}
		}
		const infIndex = definition.buckets.length;
		const infCount = current.bucketCounts[infIndex] ?? 0;
		current.bucketCounts[infIndex] = infCount + 1;
		current.sum += value;
		current.count += 1;
	}

	reset(): void {
		this.definitions.clear();
	}

	toPrometheusText(): string {
		const lines: string[] = [];
		const sortedMetrics = [...this.definitions.entries()].sort(([a], [b]) =>
			a.localeCompare(b),
		);

		for (const [name, definition] of sortedMetrics) {
			if (definition.help) {
				lines.push(`# HELP ${name} ${definition.help}`);
			}
			lines.push(`# TYPE ${name} ${definition.type}`);

			if (definition.type === "counter") {
				const sortedSeries = [...definition.series.values()].sort((a, b) =>
					formatLabels(a.labels).localeCompare(formatLabels(b.labels)),
				);
				for (const series of sortedSeries) {
					lines.push(
						`${name}${formatLabels(series.labels)} ${formatNumber(series.value)}`,
					);
				}
				continue;
			}

			const sortedSeries = [...definition.series.values()].sort((a, b) =>
				formatLabels(a.labels).localeCompare(formatLabels(b.labels)),
			);
			for (const series of sortedSeries) {
				for (let index = 0; index < definition.buckets.length; index += 1) {
					const bucket = definition.buckets[index];
					if (bucket === undefined) {
						continue;
					}
					const le = formatNumber(bucket);
					const bucketCount = series.bucketCounts[index] ?? 0;
					lines.push(
						`${name}_bucket${formatLabels(withLeLabel(series.labels, le))} ${formatNumber(bucketCount)}`,
					);
				}
				const infCount = series.bucketCounts[definition.buckets.length] ?? 0;
				lines.push(
					`${name}_bucket${formatLabels(withLeLabel(series.labels, "+Inf"))} ${formatNumber(infCount)}`,
				);
				lines.push(
					`${name}_sum${formatLabels(series.labels)} ${formatNumber(series.sum)}`,
				);
				lines.push(
					`${name}_count${formatLabels(series.labels)} ${formatNumber(series.count)}`,
				);
			}
		}

		return `${lines.join("\n")}\n`;
	}
}
