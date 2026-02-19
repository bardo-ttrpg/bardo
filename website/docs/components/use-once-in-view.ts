"use client";

import { useEffect, useRef, useState } from "react";

export function useOnceInView<T extends Element>(rootMargin = "0px") {
	const ref = useRef<T | null>(null);
	const [isInView, setIsInView] = useState(false);

	useEffect(() => {
		if (isInView) return;
		const element = ref.current;
		if (!element) return;

		if (typeof IntersectionObserver === "undefined") {
			setIsInView(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					setIsInView(true);
					observer.disconnect();
					break;
				}
			},
			{ rootMargin },
		);

		observer.observe(element);
		return () => observer.disconnect();
	}, [isInView, rootMargin]);

	return { ref, isInView };
}
