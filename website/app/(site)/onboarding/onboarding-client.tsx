"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { InitBootstrapResponse } from "@/lib/mcp-orchestrator";

type Props = {
	initial: InitBootstrapResponse;
};

type BootstrapAnswerKey =
	| "purpose"
	| "userProfile"
	| "agentProfile"
	| "workingPreferences"
	| "boundaries"
	| "successCriteria"
	| "values";

type SetupAnswerKey =
	| "ttrpgSystem"
	| "systemUrl"
	| "sourceMaterialsStatus"
	| "diceRoller"
	| "playerCount"
	| "sourcePolicy"
	| "additionalContext"
	| "materialsConfirmation";

type QuestionKey = BootstrapAnswerKey | SetupAnswerKey | "campaign_setup";

function isBootstrapAnswerKey(
	value: string | null,
): value is BootstrapAnswerKey {
	return (
		value === "purpose" ||
		value === "userProfile" ||
		value === "agentProfile" ||
		value === "workingPreferences" ||
		value === "boundaries" ||
		value === "successCriteria" ||
		value === "values"
	);
}

function isSetupAnswerKey(value: string | null): value is SetupAnswerKey {
	return (
		value === "ttrpgSystem" ||
		value === "systemUrl" ||
		value === "sourceMaterialsStatus" ||
		value === "diceRoller" ||
		value === "playerCount" ||
		value === "sourcePolicy" ||
		value === "additionalContext" ||
		value === "materialsConfirmation"
	);
}

async function callBootstrapApi(payload: {
	answers?: Partial<Record<BootstrapAnswerKey, string>>;
	setupAnswers?: Record<string, string | number>;
	setupRevision?: number;
}): Promise<InitBootstrapResponse> {
	const response = await fetch("/api/init/bootstrap", {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	const data = (await response.json()) as InitBootstrapResponse;
	return data;
}

export function OnboardingClient({ initial }: Props) {
	const router = useRouter();
	const initialResultRef = useRef(initial);
	const [result, setResult] = useState<InitBootstrapResponse>(
		initialResultRef.current,
	);
	const [value, setValue] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const progressLabel = useMemo(() => {
		const answered = result.progress.answered;
		const total = result.progress.total;
		return total > 0 ? `${answered}/${total}` : "0/0";
	}, [result.progress.answered, result.progress.total]);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const questionKey = result.questionKey as QuestionKey | null;
		if (!questionKey) {
			setError("No bootstrap question is active.");
			return;
		}
		if (!value.trim()) {
			setError("Please provide an answer before continuing.");
			return;
		}

		setSubmitting(true);
		setError(null);
		try {
			const trimmedValue = value.trim();
			let payload: {
				answers?: Partial<Record<BootstrapAnswerKey, string>>;
				setupAnswers?: Record<string, string | number>;
				setupRevision?: number;
			} = {};

			if (isBootstrapAnswerKey(questionKey)) {
				payload = {
					answers: {
						[questionKey]: trimmedValue,
					},
				};
			} else if (isSetupAnswerKey(questionKey)) {
				let setupValue: string | number = trimmedValue;
				if (questionKey === "playerCount") {
					const parsed = Number(trimmedValue);
					setupValue = Number.isFinite(parsed) ? parsed : trimmedValue;
				}
				payload = {
					setupAnswers: {
						[questionKey]: setupValue,
					},
					setupRevision: result.setup?.revision ?? undefined,
				};
			} else {
				payload = {
					setupAnswers: {
						additionalContext: trimmedValue,
					},
					setupRevision: result.setup?.revision ?? undefined,
				};
			}

			const next = await callBootstrapApi(payload);
			setResult(next);
			setValue("");
			if (next.status === "complete") {
				router.replace("/dashboard");
			}
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: "Unable to submit answer.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="border border-border bg-background">
			<div className="border-b border-border px-6 py-4">
				<p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
					Progress: {progressLabel}
				</p>
			</div>
			<div className="space-y-6 px-6 py-7">
				{result.question ? (
					<p className="text-sm leading-relaxed">{result.question}</p>
				) : (
					<p className="text-sm text-muted-foreground">
						Awaiting bootstrap question...
					</p>
				)}

				<form onSubmit={handleSubmit} className="space-y-4">
					<textarea
						value={value}
						onChange={(event) => setValue(event.target.value)}
						rows={6}
						className="w-full border border-border bg-background px-4 py-3 font-mono text-xs leading-relaxed outline-none transition-colors focus:border-foreground"
						placeholder="Type your answer..."
					/>

					<div className="flex items-center justify-between gap-3">
						{error ? (
							<p className="font-mono text-[11px] text-destructive">{error}</p>
						) : (
							<p className="font-mono text-[11px] text-muted-foreground">
								One answer at a time. Bootstrap will continue automatically.
							</p>
						)}
						<button
							type="submit"
							disabled={submitting}
							className="border border-foreground px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-60"
						>
							{submitting ? "Saving..." : "Continue"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
