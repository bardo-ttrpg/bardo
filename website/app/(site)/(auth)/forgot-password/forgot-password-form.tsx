"use client";

import { useSignIn } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type ForgotPasswordStep = "request" | "verify" | "complete";

function normalizeIdentifier(value: string) {
	return value.trim();
}

function formatError(error: unknown): string {
	if (isClerkAPIResponseError(error) && error.errors[0]?.longMessage) {
		return error.errors[0].longMessage;
	}
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return "We could not complete that step. Please try again.";
}

type ResetPasswordSignIn = {
	create(args: {
		strategy: "reset_password_email_code";
		identifier: string;
	}): Promise<void>;
	attemptFirstFactor(args: {
		strategy: "reset_password_email_code";
		code: string;
		password: string;
	}): Promise<{
		status: string;
		createdSessionId?: string | null;
	}>;
};

type ResetPasswordFlow = {
	isLoaded: boolean;
	signIn: ResetPasswordSignIn | null;
	setActive(args: { session?: string | null }): Promise<void>;
};

export function ForgotPasswordForm() {
	const router = useRouter();
	const { isLoaded, signIn, setActive } =
		useSignIn() as unknown as ResetPasswordFlow;
	const [step, setStep] = useState<ForgotPasswordStep>("request");
	const [identifier, setIdentifier] = useState("");
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const fieldClassName =
		"w-full border border-border bg-background px-4 py-3 font-ui text-sm text-foreground outline-none transition-colors focus:border-foreground";
	const actionClassName =
		"ui-button inline-flex border border-foreground px-4 py-2 text-foreground transition-colors hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-60";

	async function handleRequest(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!isLoaded || !signIn) return;

		setSubmitting(true);
		setError(null);
		setStatusMessage(null);

		try {
			await signIn.create({
				strategy: "reset_password_email_code",
				identifier: normalizeIdentifier(identifier),
			});
			setStep("verify");
			setStatusMessage("Verification code sent. Check your inbox.");
		} catch (caught) {
			setError(formatError(caught));
		} finally {
			setSubmitting(false);
		}
	}

	async function handleVerification(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!isLoaded || !signIn) return;

		setSubmitting(true);
		setError(null);
		setStatusMessage(null);

		try {
			const result = await signIn.attemptFirstFactor({
				strategy: "reset_password_email_code",
				code: code.trim(),
				password,
			});

			if (result.status === "complete") {
				await setActive({ session: result.createdSessionId });
				setStep("complete");
				setStatusMessage("Password updated. Redirecting to your dashboard.");
				router.replace("/dashboard");
				return;
			}

			setError(
				"Password reset is still incomplete. Please request a new code.",
			);
		} catch (caught) {
			setError(formatError(caught));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="space-y-6 border border-border bg-card p-6">
			{step === "request" ? (
				<form className="space-y-5" onSubmit={handleRequest}>
					<div className="space-y-2">
						<label
							htmlFor="identifier"
							className="ui-label text-muted-foreground"
						>
							Email address
						</label>
						<input
							id="identifier"
							type="email"
							value={identifier}
							onChange={(event) => setIdentifier(event.target.value)}
							className={fieldClassName}
							placeholder="you@example.com"
							autoComplete="email"
							required
						/>
					</div>
					<button
						type="submit"
						disabled={submitting || !isLoaded}
						className={actionClassName}
					>
						{submitting ? "Sending code..." : "Send reset code"}
					</button>
				</form>
			) : null}

			{step === "verify" ? (
				<form className="space-y-5" onSubmit={handleVerification}>
					<div className="space-y-2">
						<label htmlFor="code" className="ui-label text-muted-foreground">
							Verification code
						</label>
						<input
							id="code"
							type="text"
							value={code}
							onChange={(event) => setCode(event.target.value)}
							className={fieldClassName}
							autoComplete="one-time-code"
							required
						/>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="password"
							className="ui-label text-muted-foreground"
						>
							New password
						</label>
						<input
							id="password"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							className={fieldClassName}
							autoComplete="new-password"
							required
						/>
					</div>
					<button
						type="submit"
						disabled={submitting || !isLoaded}
						className={actionClassName}
					>
						{submitting ? "Updating password..." : "Update password"}
					</button>
				</form>
			) : null}

			{step === "complete" ? (
				<div className="space-y-3">
					<p className="font-reading-body text-foreground">
						Password reset complete. Continue to the dashboard if you are not
						redirected automatically.
					</p>
					<Link
						href="/dashboard"
						className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
					>
						Open dashboard
					</Link>
				</div>
			) : null}

			{statusMessage ? (
				<p className="font-reading-body border border-border bg-background px-4 py-3 text-muted-foreground">
					{statusMessage}
				</p>
			) : null}

			{error ? (
				<p className="font-reading-body border border-border bg-background px-4 py-3 text-foreground">
					{error}
				</p>
			) : null}

			<p className="font-reading-body text-muted-foreground">
				Remembered it?{" "}
				<Link
					href="/sign-in"
					className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
				>
					Back to sign in
				</Link>
				.
			</p>
		</div>
	);
}
