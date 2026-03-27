"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

export default function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	if (!mounted) {
		return <span className="theme-toggle-shell h-10 w-[120px]" />;
	}

	const isDark = resolvedTheme === "dark";
	const changeTheme = (nextTheme: "dark" | "light") => {
		if (nextTheme === resolvedTheme) {
			return;
		}

		const startViewTransition = document.startViewTransition?.bind(document);

		if (!startViewTransition) {
			setTheme(nextTheme);
			return;
		}

		startViewTransition(() => {
			flushSync(() => {
				setTheme(nextTheme);
			});
		});
	};

	return (
		<fieldset className="theme-toggle-shell" aria-label="Theme switch">
			<button
				type="button"
				onClick={() => changeTheme("dark")}
				aria-pressed={isDark}
				className={isDark ? "theme-toggle-active" : "theme-toggle-idle"}
			>
				Dark
			</button>
			<button
				type="button"
				onClick={() => changeTheme("light")}
				aria-pressed={!isDark}
				className={!isDark ? "theme-toggle-active" : "theme-toggle-idle"}
			>
				Light
			</button>
		</fieldset>
	);
}
