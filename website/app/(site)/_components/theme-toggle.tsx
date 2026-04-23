"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

type ViewTransitionDocument = Document & {
	startViewTransition?: (update: () => void) => {
		finished?: Promise<void>;
	};
};

export function ThemeToggle({ className }: { className?: string }) {
	const { resolvedTheme, setTheme } = useTheme();
	const isHydrated = useHydrated();
	const isDark = !isHydrated || resolvedTheme !== "light";
	const nextTheme = isDark ? "light" : "dark";
	const iconTransitionClassName =
		"absolute size-4 transition-[transform,opacity] duration-(--motion-duration-slow) ease-(--motion-ease-standard)";

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
		}, 560);
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
						iconTransitionClassName,
						isDark ? "rotate-90 opacity-0" : "rotate-0 opacity-100",
					)}
				/>
				<MoonIcon
					aria-hidden="true"
					className={cn(
						iconTransitionClassName,
						isDark ? "rotate-0 opacity-100" : "-rotate-90 opacity-0",
					)}
				/>
			</span>
		</Button>
	);
}
