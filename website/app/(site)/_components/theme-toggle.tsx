"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ViewTransitionDocument = Document & {
	startViewTransition?: (update: () => void) => {
		finished?: Promise<void>;
	};
};

export function ThemeToggle({ className }: { className?: string }) {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const isDark = !mounted || resolvedTheme !== "light";
	const nextTheme = isDark ? "light" : "dark";

	function handleToggle() {
		const transitionDocument = document as ViewTransitionDocument;
		const rootElement = transitionDocument.documentElement;
		rootElement.dataset.themeTransition = nextTheme;

		if (transitionDocument.startViewTransition) {
			const transition = transitionDocument.startViewTransition(() => {
				setTheme(nextTheme);
			});
			transition.finished?.finally(() => {
				delete rootElement.dataset.themeTransition;
			});
			return;
		}

		setTheme(nextTheme);
		window.setTimeout(() => {
			delete rootElement.dataset.themeTransition;
		}, 420);
	}

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			className={cn(
				"text-foreground shadow-none hover:cursor-pointer",
				className,
			)}
			onClick={handleToggle}
			aria-label={`Switch to ${nextTheme} mode`}
			title={`Switch to ${nextTheme} mode`}
		>
			<span className="relative flex size-4 items-center justify-center">
				<SunIcon
					aria-hidden="true"
					className={cn(
						"absolute size-4 [transition-duration:var(--motion-duration-slow)] [transition-property:transform,opacity] [transition-timing-function:var(--motion-ease-standard)]",
						isDark ? "rotate-90 opacity-0" : "rotate-0 opacity-100",
					)}
				/>
				<MoonIcon
					aria-hidden="true"
					className={cn(
						"absolute size-4 [transition-duration:var(--motion-duration-slow)] [transition-property:transform,opacity] [transition-timing-function:var(--motion-ease-standard)]",
						isDark ? "rotate-0 opacity-100" : "-rotate-90 opacity-0",
					)}
				/>
			</span>
		</Button>
	);
}
