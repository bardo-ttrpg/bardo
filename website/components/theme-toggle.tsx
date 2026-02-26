"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	if (!mounted) return <span className="h-4 w-4" />;

	const isDark = resolvedTheme === "dark";
	return (
		<button
			type="button"
			onClick={() => setTheme(isDark ? "light" : "dark")}
			className="text-muted-foreground transition-colors hover:text-foreground"
			aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
		</button>
	);
}
