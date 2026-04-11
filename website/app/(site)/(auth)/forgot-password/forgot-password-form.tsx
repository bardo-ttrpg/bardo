"use client";

import { useSignIn } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useRouter } from "next/navigation";
import { type FormEvent, useReducer } from "react";
import { TransitionLink } from "@/components/transition-link";

type ForgotPasswordStep = "request" | "verify" | "complete";

type ForgotPasswordState = {
	step: ForgotPasswordStep;
	identifier: string;
	code: string;
	password: string;
	submitting: boolean;
	error: string | null;
	statusMessage: string | null;
};

type ForgotPasswordAction =
	| { type: "setIdentifier"; value: string }
	| { type: "setCode"; value: string }
	| { type: "setPassword"; value: string }
	| { type: "submit_start" }
	| { type: "submit_finish" }
	| { type: "set_error"; value: string | null }
	| { type: "set_status"; value: string | null }
	| { type: "set_step"; value: ForgotPasswordStep };

const initialForgotPasswordState: ForgotPasswordState = {
	step: "request",
	identifier: "",
	code: "",
	password: "",
	submitting: false,
	error: null,
	statusMessage: null,
};

function forgotPasswordReducer(
	state: ForgotPasswordState,
	action: ForgotPasswordAction,
): ForgotPasswordState {
	switch (action.type) {
		case "setIdentifier":
			return { ...state, identifier: action.value };
		case "setCode":
			return { ...state, code: action.value };
		case "setPassword":
			return { ...state, password: action.value };
		case "submit_start":
			return {
				...state,
				submitting: true,
				error: null,
				statusMessage: null,
			};
		case "submit_finish":
			return { ...state, submitting: false };
		case "set_error":
			return { ...state, error: action.value };
		case "set_status":
			return { ...state, statusMessage: action.value };
		case "set_step":
			return { ...state, step: action.value };
	}
}

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
	const [state, dispatch] = useReducer(
		forgotPasswordReducer,
		initialForgotPasswordState,
	);
	const { step, identifier, code, password, submitting, error, statusMessage } =
		state;
	const fieldClassName =
		"w-full border border-border bg-background px-4 py-3 font-ui text-sm text-foreground outline-none transition-colors focus:border-foreground";
	const actionClassName =
		"ui-button inline-flex border border-foreground px-4 py-2 text-foreground transition-colors hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-60";

	async function handleRequest(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!isLoaded || !signIn) return;

		dispatch({ type: "submit_start" });

		try {
			await signIn.create({
				strategy: "reset_password_email_code",
				identifier: normalizeIdentifier(identifier),
			});
			dispatch({ type: "set_step", value: "verify" });
			dispatch({
				type: "set_status",
				value: "Verification code sent. Check your inbox.",
			});
		} catch (caught) {
			dispatch({ type: "set_error", value: formatError(caught) });
		} finally {
			dispatch({ type: "submit_finish" });
		}
	}

	async function handleVerification(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!isLoaded || !signIn) return;

		dispatch({ type: "submit_start" });

		try {
			const result = await signIn.attemptFirstFactor({
				strategy: "reset_password_email_code",
				code: code.trim(),
				password,
			});

			if (result.status === "complete") {
				await setActive({ session: result.createdSessionId });
				dispatch({ type: "set_step", value: "complete" });
				dispatch({
					type: "set_status",
					value: "Password updated. Redirecting to your dashboard.",
				});
				router.replace("/dashboard");
				return;
			}

			dispatch({
				type: "set_error",
				value: "Password reset is still incomplete. Please request a new code.",
			});
		} catch (caught) {
			dispatch({ type: "set_error", value: formatError(caught) });
		} finally {
			dispatch({ type: "submit_finish" });
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
							onChange={(event) =>
								dispatch({ type: "setIdentifier", value: event.target.value })
							}
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
							onChange={(event) =>
								dispatch({ type: "setCode", value: event.target.value })
							}
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
							onChange={(event) =>
								dispatch({ type: "setPassword", value: event.target.value })
							}
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
					<TransitionLink
						href="/dashboard"
						className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
					>
						Open dashboard
					</TransitionLink>
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
				<TransitionLink
					href="/sign-in"
					className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
				>
					Back to sign in
				</TransitionLink>
				.
			</p>
		</div>
	);
}
