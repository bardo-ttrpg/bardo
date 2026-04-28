export const clerkAppearance = {
	variables: {
		colorPrimary: "var(--primary)",
		colorBackground: "var(--card)",
		colorInputBackground: "var(--background)",
		colorInputText: "var(--foreground)",
		colorText: "var(--foreground)",
		colorTextSecondary: "var(--muted-foreground)",
		colorTextOnPrimaryBackground: "var(--primary-foreground)",
		colorDanger: "var(--destructive)",
		fontFamily: "var(--font-inter)",
		fontFamilyButtons: "var(--font-inter)",
		borderRadius: "var(--radius)",
	},
	elements: {
		rootBox: "w-full",
		cardBox: "w-full",
		card: "w-full rounded-[var(--radius)] border border-border bg-card text-card-foreground shadow-none",
		headerTitle:
			"font-heading text-3xl leading-none tracking-[-0.045em] text-foreground",
		headerSubtitle: "text-sm text-muted-foreground",
		socialButtonsBlockButton:
			"rounded-full border border-border bg-background text-foreground shadow-none transition-colors hover:border-primary hover:bg-transparent hover:text-primary",
		socialButtonsBlockButtonText: "font-reading-body text-foreground",
		formFieldLabel: "ui-label text-foreground",
		formFieldInput:
			"rounded-[calc(var(--radius)-2px)] border border-input bg-background text-foreground shadow-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-0",
		formFieldCheckboxInput:
			"bardo-clerk-checkbox rounded-[calc(var(--radius)-4px)] border border-input shadow-none",
		formFieldAction:
			"text-muted-foreground transition-colors hover:text-foreground",
		formButtonPrimary:
			"rounded-full bg-primary text-primary-foreground shadow-none transition-colors hover:bg-primary/90",
		footerActionText: "text-muted-foreground",
		footerActionLink:
			"underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground",
		dividerLine: "bg-border",
		dividerText: "bg-card text-muted-foreground",
		identityPreviewText: "text-foreground",
		identityPreviewEditButton:
			"text-muted-foreground transition-colors hover:text-foreground",
		formResendCodeLink:
			"underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground",
		otpCodeFieldInput:
			"border border-input bg-background text-foreground shadow-none",
		alert: "border border-border bg-background text-foreground",
		alertText: "text-foreground",
	},
};
