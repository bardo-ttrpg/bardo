"use client";

import { useState } from "react";

const SUBJECT_OPTIONS = [
	"Customer support",
	"Investment options",
	"Partnership & Business Inquiries",
	"Other",
] as const;

export default function AssetContactForm() {
	const [isSending, setIsSending] = useState(false);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSending(true);

		const form = new FormData(event.currentTarget);
		const firstName = String(form.get("firstName") ?? "");
		const lastName = String(form.get("lastName") ?? "");
		const email = String(form.get("email") ?? "");
		const phone = String(form.get("phone") ?? "");
		const subject = String(form.get("subject") ?? "");
		const message = String(form.get("message") ?? "");

		const mailtoSubject = encodeURIComponent(`Asset Inquiry: ${subject}`);
		const mailtoBody = encodeURIComponent(
			[
				`First name: ${firstName}`,
				`Last name: ${lastName}`,
				`Email: ${email}`,
				`Phone: ${phone}`,
				"",
				message,
			].join("\n"),
		);

		window.location.href = `mailto:contact@asset.com?subject=${mailtoSubject}&body=${mailtoBody}`;
		setTimeout(() => setIsSending(false), 250);
	}

	return (
		<form onSubmit={handleSubmit} className="grid gap-5">
			<div className="grid gap-5 sm:grid-cols-2">
				<label className="grid gap-2 text-sm text-white/68">
					<span>First name*</span>
					<input
						required
						name="firstName"
						className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/28"
					/>
				</label>
				<label className="grid gap-2 text-sm text-white/68">
					<span>Last name*</span>
					<input
						required
						name="lastName"
						className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/28"
					/>
				</label>
			</div>

			<div className="grid gap-5 sm:grid-cols-2">
				<label className="grid gap-2 text-sm text-white/68">
					<span>Email*</span>
					<input
						required
						type="email"
						name="email"
						className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/28"
					/>
				</label>
				<label className="grid gap-2 text-sm text-white/68">
					<span>Phone</span>
					<input
						name="phone"
						className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/28"
					/>
				</label>
			</div>

			<label className="grid gap-2 text-sm text-white/68">
				<span>Subject*</span>
				<select
					required
					name="subject"
					defaultValue=""
					className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white"
				>
					<option value="" disabled>
						Select…
					</option>
					{SUBJECT_OPTIONS.map((subject) => (
						<option key={subject} value={subject} className="text-black">
							{subject}
						</option>
					))}
				</select>
			</label>

			<label className="grid gap-2 text-sm text-white/68">
				<span>Your message*</span>
				<textarea
					required
					name="message"
					rows={6}
					className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/28"
				/>
			</label>

			<button
				type="submit"
				className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 font-mono text-[11px] uppercase tracking-[0.22em] text-[#080a09] disabled:cursor-wait disabled:opacity-80"
				disabled={isSending}
			>
				{isSending ? "Opening mail..." : "Submit"}
			</button>
		</form>
	);
}
