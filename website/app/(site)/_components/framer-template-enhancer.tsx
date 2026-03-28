"use client";

import { useEffect } from "react";

const MOBILE_BREAKPOINT = 809.98;

const MOBILE_MENU_LINKS = [
	{ label: "Overview", href: "/#overview" },
	{ label: "Features", href: "/#features" },
	{ label: "Integrations", href: "/#integrations" },
	{ label: "Benefits", href: "/#benefits" },
	{ label: "About", href: "/#about" },
	{ label: "Reviews", href: "/#reviews" },
	{ label: "Pricing", href: "/#pricing" },
] as const;

// Framer appear animation configurations extracted from the template
// These match the exact animations from the original Framer export
const APPEAR_ANIMATIONS: Record<
	string,
	{
		initial: { opacity: number; y: number };
		animate: { opacity: number; y: number };
		transition: { delay: number; duration: number; ease: number[] };
	}
> = {
	ha94kp: {
		initial: { opacity: 0.001, y: 24 },
		animate: { opacity: 1, y: 0 },
		transition: { delay: 0, duration: 1.5, ease: [0.12, 0.23, 0.17, 0.99] },
	},
	"1g4nwc": {
		initial: { opacity: 0.001, y: 24 },
		animate: { opacity: 1, y: 0 },
		transition: { delay: 0.4, duration: 1.5, ease: [0.12, 0.23, 0.17, 0.99] },
	},
	"4mw8f2": {
		initial: { opacity: 0.001, y: 24 },
		animate: { opacity: 1, y: 0 },
		transition: { delay: 0.6, duration: 1.5, ease: [0.12, 0.23, 0.17, 0.99] },
	},
	"1cfeb4q": {
		initial: { opacity: 0.001, y: 24 },
		animate: { opacity: 1, y: 0 },
		transition: { delay: 0.6, duration: 1.5, ease: [0.12, 0.23, 0.17, 0.99] },
	},
};

// FAQ answers matching the template
const FAQ_ANSWERS = new Map<string, string>([
	[
		"How does the platform support investing workflows?",
		"Centralizes decisions, research, and execution so teams manage investing workflows faster with full visibility.",
	],
	[
		"Is my financial data secure and compliant?",
		"Data is protected with encryption, governance controls, and compliance aligned with industry security standards.",
	],
	[
		"Does the platform support custom models?",
		"Yes, you can build, deploy, and manage custom models tailored to specific investment strategies.",
	],
	[
		"Can I integrate existing data sources?",
		"Integrate internal systems, external providers, and data tools through secure and flexible infrastructure connections.",
	],
	[
		"How does pricing scale for teams?",
		"Plans scale with team size, advanced workflows, and infrastructure needs as organizations grow over time.",
	],
	[
		"What compliance standards does the platform meet?",
		"The platform aligns with SOC2, ISO, GDPR, and CCPA to ensure strong regulatory compliance.",
	],
	[
		"Can I automate workflows using financial agents?",
		"Yes, financial agents automate tasks, monitor signals, and execute workflows based on predefined logic.",
	],
	[
		"How does collaboration work across teams?",
		"Teams collaborate through shared workflows, permissions, and centralized visibility across investing operations and research.",
	],
]);

type PriceNode = {
	hidden: HTMLElement;
	monthlyValue: number;
	visible: HTMLElement;
	yearlyValue: number;
};

function isVisible(element: Element) {
	return element instanceof HTMLElement && element.offsetParent !== null;
}

// Convert cubic-bezier array to CSS string
function cubicBezier(ease: number[]) {
	return `cubic-bezier(${ease.join(", ")})`;
}

function initAppearAnimations() {
	const fallbackStyle = document.querySelector(
		"style[data-nce-scroll-fallback]",
	);

	if (
		typeof IntersectionObserver === "undefined" ||
		typeof Element.prototype.animate !== "function"
	) {
		return () => {};
	}

	fallbackStyle?.remove();

	const prefersReducedMotion =
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	// First, handle elements with Framer appear IDs
	const appearElements = document.querySelectorAll<HTMLElement>(
		"[data-framer-appear-id]",
	);

	for (const element of appearElements) {
		const appearId = element.getAttribute("data-framer-appear-id");
		if (!appearId || element.dataset.codexAppearInit) continue;

		const config = APPEAR_ANIMATIONS[appearId];
		if (!config) continue;

		element.dataset.codexAppearInit = "true";

		if (prefersReducedMotion) {
			element.style.opacity = "1";
			element.style.transform = "none";
			continue;
		}

		// Set initial state
		element.style.opacity = String(config.initial.opacity);
		element.style.transform = `translateY(${config.initial.y}px)`;

		// Animate after delay
		setTimeout(() => {
			element.animate(
				[
					{
						opacity: config.initial.opacity,
						transform: `translateY(${config.initial.y}px)`,
					},
					{
						opacity: config.animate.opacity,
						transform: `translateY(${config.animate.y}px)`,
					},
				],
				{
					duration: config.transition.duration * 1000,
					easing: cubicBezier(config.transition.ease),
					fill: "forwards",
				},
			);
		}, config.transition.delay * 1000);
	}

	// Then, handle scroll-triggered reveal animations for other elements
	for (const element of document.querySelectorAll<HTMLElement>("[style]")) {
		const style = element.getAttribute("style") ?? "";
		if (
			!/opacity\s*:\s*(0|0\.001)([;\s]|$)/.test(style) ||
			!/transform\s*:/.test(style) ||
			/transform\s*:\s*none/.test(style) ||
			element.hasAttribute("data-nce-scroll") ||
			element.hasAttribute("data-framer-appear-id")
		) {
			continue;
		}

		if (/translate\(\s*-50%\s*,\s*-50%\s*\)/.test(style)) {
			element.style.opacity = "1";
			continue;
		}

		element.setAttribute("data-nce-scroll", "true");
		const match = style.match(/transform\s*:\s*([^;]+)/);
		if (match?.[1]) {
			element.setAttribute("data-nce-initial-transform", match[1].trim());
		}
	}

	const scrollElements = Array.from(
		document.querySelectorAll<HTMLElement>("[data-nce-scroll]"),
	).filter((element) => !element.dataset.codexRevealInit);

	if (scrollElements.length === 0) {
		return () => {};
	}

	if (prefersReducedMotion) {
		for (const element of scrollElements) {
			element.dataset.codexRevealInit = "true";
			element.style.opacity = "1";
			const transform =
				element.getAttribute("data-nce-initial-transform") ||
				element.style.transform ||
				"";
			const perspective = transform.match(/perspective\([^)]+\)/)?.[0];
			element.style.transform = perspective ?? "none";
		}

		return () => {};
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) {
					continue;
				}

				const element = entry.target;
				const initialTransform =
					element.getAttribute("data-nce-initial-transform") ||
					element.style.transform ||
					"translateY(24px)";

				if (/translate\(\s*-50%\s*,\s*-50%\s*\)/.test(initialTransform)) {
					element.style.opacity = "1";
					observer.unobserve(element);
					continue;
				}

				const finalTransform =
					initialTransform.match(/perspective\([^)]+\)/)?.[0] ?? "none";

				// Use the same easing as Framer's appear animations
				const animation = element.animate(
					[
						{ opacity: 0, transform: initialTransform },
						{ opacity: 1, transform: finalTransform },
					],
					{
						duration: 1500,
						easing: cubicBezier([0.12, 0.23, 0.17, 0.99]),
						fill: "forwards",
					},
				);

				animation.onfinish = () => {
					element.style.opacity = "1";
					element.style.transform = finalTransform;
				};
				observer.unobserve(element);
			}
		},
		{ threshold: 0.1 },
	);

	for (const element of scrollElements) {
		element.dataset.codexRevealInit = "true";
		observer.observe(element);
	}

	return () => observer.disconnect();
}

function initAccordion() {
	// Find FAQ section and accordion items
	const faqSection = document.querySelector("#faq");
	if (!faqSection) return () => {};

	const items = Array.from(
		faqSection.querySelectorAll<HTMLElement>(
			'[data-highlight="true"][tabindex="0"]',
		),
	).filter(isVisible);

	if (items.length === 0) {
		return () => {};
	}

	const cleanups: Array<() => void> = [];
	const openClass = "framer-v-k225cd";
	const closedClass = "framer-v-iopx56";
	const openColor = "rgb(241, 148, 71)";
	const closedColor = "rgb(35, 35, 38)";

	const ensureDescription = (item: HTMLElement, answer: string) => {
		const existing = item.querySelector<HTMLElement>(
			'[data-framer-name="Description"]',
		);
		if (existing) {
			return existing;
		}

		const description = document.createElement("div");
		description.className = "framer-1n78og9";
		description.setAttribute("data-framer-name", "Description");
		description.setAttribute("data-framer-component-type", "RichTextContainer");
		description.style.justifyContent = "center";
		description.style.setProperty("--framer-paragraph-spacing", "0px");
		description.style.transform = "none";
		description.style.opacity = "0";

		const paragraph = document.createElement("p");
		paragraph.className = "framer-text framer-styles-preset-o2x06q";
		paragraph.setAttribute("data-styles-preset", "pWARBbc57");
		paragraph.setAttribute("dir", "auto");
		paragraph.textContent = answer;

		description.append(paragraph);
		item.append(description);
		return description;
	};

	const closeItem = (item: HTMLElement) => {
		item.classList.remove(openClass);
		item.classList.add(closedClass);
		item.setAttribute("data-framer-name", "Closed");

		const description = item.querySelector<HTMLElement>(
			'[data-framer-name="Description"]',
		);
		if (description) {
			description.animate(
				[
					{ opacity: 1, transform: "translateY(0px)" },
					{ opacity: 0, transform: "translateY(-6px)" },
				],
				{ duration: 180, easing: "ease-out", fill: "forwards" },
			).onfinish = () => {
				description.remove();
			};
		}

		const indicator = item.querySelector<HTMLElement>(
			'[data-framer-name="Indicator"]',
		);
		if (indicator) {
			indicator.style.transition = "background-color 0.25s ease";
			indicator.style.backgroundColor = closedColor;
			indicator.style.opacity = "1";
			indicator.style.transform = "none";
		}
	};

	const openItem = (item: HTMLElement, answer: string) => {
		item.classList.remove(closedClass);
		item.classList.add(openClass);
		item.setAttribute("data-framer-name", "Open");

		const indicator = item.querySelector<HTMLElement>(
			'[data-framer-name="Indicator"]',
		);
		if (indicator) {
			indicator.style.transition = "background-color 0.25s ease";
			indicator.style.backgroundColor = openColor;
			indicator.style.opacity = "1";
			indicator.style.transform = "none";
		}

		const description = ensureDescription(item, answer);
		requestAnimationFrame(() => {
			description.animate(
				[
					{ opacity: 0, transform: "translateY(-6px)" },
					{ opacity: 1, transform: "translateY(0px)" },
				],
				{ duration: 220, easing: "ease-out", fill: "forwards" },
			);
		});
	};

	for (const item of items) {
		if (item.dataset.codexAccordionInit) {
			continue;
		}

		item.dataset.codexAccordionInit = "true";
		item.classList.add("nce-acc-trigger");
		item.style.cursor = "pointer";
		closeItem(item);

		const question = item.textContent?.trim() ?? "";
		const answer = FAQ_ANSWERS.get(question);
		if (!answer) {
			continue;
		}

		const toggle = (event?: Event) => {
			const target = event?.target;
			if (target instanceof Element && target.closest("a")) {
				return;
			}

			const isOpen = item.getAttribute("data-framer-name") === "Open";
			for (const sibling of items) {
				if (sibling !== item && sibling.getAttribute("data-framer-name") === "Open") {
					const sibQuestion = sibling.textContent?.trim() ?? "";
					const sibAnswer = FAQ_ANSWERS.get(sibQuestion);
					if (sibAnswer) {
						closeItem(sibling);
					}
				}
			}

			if (isOpen) {
				closeItem(item);
				return;
			}

			openItem(item, answer);
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				toggle(event);
			}
		};

		item.addEventListener("click", toggle);
		item.addEventListener("keydown", onKeyDown);
		cleanups.push(() => {
			item.removeEventListener("click", toggle);
			item.removeEventListener("keydown", onKeyDown);
		});
	}

	return () => {
		for (const cleanup of cleanups) {
			cleanup();
		}
	};
}

function initNavScroll() {
	type NavCandidate = {
		element: HTMLElement;
		targetBackground: string;
	};

	const isTransparentBackground = (value: string) => {
		const normalized = value.replace(/\s+/g, "").toLowerCase();
		return (
			normalized === "transparent" ||
			normalized === "rgba(0,0,0,0)" ||
			normalized === "rgb(0,0,0,0)" ||
			normalized === "rgba(255,255,255,0)"
		);
	};

	const findNavs = (): NavCandidate[] => {
		const results: NavCandidate[] = [];
		for (const element of document.querySelectorAll<HTMLElement>(
			"nav, header, [role='navigation']",
		)) {
			const styles = getComputedStyle(element);
			const parent = element.parentElement;
			const parentStyles = parent ? getComputedStyle(parent) : null;
			const isFixed =
				styles.position === "fixed" ||
				styles.position === "sticky" ||
				parentStyles?.position === "fixed" ||
				parentStyles?.position === "sticky";
			const isTop =
				Number.parseFloat(styles.top) <= 5 ||
				(parentStyles ? Number.parseFloat(parentStyles.top) <= 5 : false);

			if (
				!isFixed ||
				!isTop ||
				!isTransparentBackground(styles.backgroundColor) ||
				element.querySelectorAll("a").length === 0
			) {
				continue;
			}

			results.push({
				element,
				targetBackground: "rgba(0,0,0,0.8)",
			});
		}

		return results;
	};

	const cleanups: Array<() => void> = [];

	for (const nav of findNavs()) {
		if (nav.element.dataset.codexNavInit) {
			continue;
		}

		nav.element.dataset.codexNavInit = "true";
		const originalBackground =
			nav.element.style.backgroundColor ||
			getComputedStyle(nav.element).backgroundColor;
		const originalBackdrop = nav.element.style.backdropFilter || "none";

		nav.element.style.transition =
			"background-color 0.3s ease, backdrop-filter 0.3s ease, -webkit-backdrop-filter 0.3s ease";

		let scrolled = false;
		let ticking = false;

		const onScroll = () => {
			if (ticking) {
				return;
			}
			ticking = true;
			requestAnimationFrame(() => {
				const y = window.pageYOffset || document.documentElement.scrollTop;
				if (y > 50 && !scrolled) {
					scrolled = true;
					nav.element.style.backgroundColor = nav.targetBackground;
					nav.element.style.backdropFilter = "blur(10px)";
					nav.element.style.setProperty("-webkit-backdrop-filter", "blur(10px)");
				} else if (y <= 10 && scrolled) {
					scrolled = false;
					nav.element.style.backgroundColor = originalBackground;
					nav.element.style.backdropFilter = originalBackdrop;
					nav.element.style.setProperty(
						"-webkit-backdrop-filter",
						originalBackdrop,
					);
				}
				ticking = false;
			});
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();
		cleanups.push(() => window.removeEventListener("scroll", onScroll));
	}

	return () => {
		for (const cleanup of cleanups) {
			cleanup();
		}
	};
}

function initAnimatedCounters() {
	const counters = Array.from(
		document.querySelectorAll<HTMLElement>("[data-nce-counter]"),
	).filter(
		(counter) =>
			!counter.dataset.codexCounterInit && !counter.closest("#pricing"),
	);

	if (counters.length === 0 || typeof IntersectionObserver === "undefined") {
		return () => {};
	}

	for (const counter of counters) {
		counter.dataset.codexCounterInit = "true";
		if (!counter.dataset.nceCounterTarget) {
			const text = counter.innerText.replace(/[^0-9]/g, "");
			if (text) {
				counter.dataset.nceCounterTarget = text;
				counter.innerText = "0";
			}
		}
	}

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) {
					continue;
				}

				const element = entry.target;
				const targetValue = Number.parseInt(
					element.dataset.nceCounterTarget ?? "0",
					10,
				);
				if (targetValue <= 0 || element.dataset.codexCounterAnimated) {
					observer.unobserve(element);
					continue;
				}

				element.dataset.codexCounterAnimated = "true";
				let startTime: number | null = null;
				const duration = 2000;

				const step = (timestamp: number) => {
					if (startTime === null) {
						startTime = timestamp;
					}

					const progress = timestamp - startTime;
					const percentage = Math.min(progress / duration, 1);
					const ease = 1 - (1 - percentage) ** 4;
					element.innerText = `${Math.floor(ease * targetValue)}`;

					if (percentage < 1) {
						requestAnimationFrame(step);
						return;
					}

					element.innerText = `${targetValue}`;
				};

				requestAnimationFrame(step);
				observer.unobserve(element);
			}
		},
		{ threshold: 0.2 },
	);

	for (const counter of counters) {
		observer.observe(counter);
	}

	return () => observer.disconnect();
}

function initSectionVisibilityFixes() {
	// Fix integrations section visibility
	for (const element of document.querySelectorAll<HTMLElement>(
		'#integrations [style*="mask-image"], #integrations [style*="-webkit-mask-image"]',
	)) {
		element.style.opacity = "1";
	}

	// Ensure all masked images are visible
	for (const element of document.querySelectorAll<HTMLElement>(
		'[style*="mask-image"]',
	)) {
		const style = element.getAttribute("style") || "";
		if (style.includes("opacity: 0") || style.includes("opacity:0")) {
			element.style.opacity = "1";
		}
	}

	return () => {};
}

function initPricingToggle() {
	const pricing = document.querySelector("#pricing");
	if (!(pricing instanceof HTMLElement)) {
		return () => {};
	}

	const toggleElement = Array.from(
		pricing.querySelectorAll<HTMLElement>('[data-framer-name="Switch"]'),
	).find(isVisible);

	if (
		!(toggleElement instanceof HTMLElement) ||
		toggleElement.dataset.codexToggleInit
	) {
		return () => {};
	}

	toggleElement.dataset.codexToggleInit = "true";
	toggleElement.style.cursor = "pointer";
	
	const toggleRoot = toggleElement.parentElement;
	if (!toggleRoot) {
		return () => {};
	}

	const monthlyLabel = toggleRoot.querySelector<HTMLElement>(
		'[data-framer-name="Monthly"]',
	);
	const yearlyLabel = toggleRoot.querySelector<HTMLElement>(
		'[data-framer-name="Yearly"]',
	);
	const monthlyTargets = Array.from(
		toggleRoot.querySelectorAll<HTMLElement>('[data-framer-name="Monthly"]'),
	).filter(
		(element) =>
			isVisible(element) && element.textContent?.trim() === "Monthly",
	);
	const yearlyTargets = Array.from(
		toggleRoot.querySelectorAll<HTMLElement>('[data-framer-name="Yearly"]'),
	).filter(
		(element) => isVisible(element) && element.textContent?.trim() === "Yearly",
	);
	const knob = toggleElement.querySelector<HTMLElement>(
		'[data-framer-name="Background"]',
	);

	const priceGroups = Array.from(pricing.querySelectorAll("div")).filter(
		(element) =>
			isVisible(element) &&
			element.children.length === 2 &&
			element.firstElementChild?.tagName === "H3" &&
			element.lastElementChild?.tagName === "H3",
	) as HTMLElement[];

	const priceNodes: PriceNode[] = priceGroups.map((group) => {
		const hidden = group.firstElementChild as HTMLElement;
		const visible = group.lastElementChild as HTMLElement;
		const value = Number.parseInt(
			visible.textContent?.replace(/[^\d]/g, "") ?? "0",
			10,
		);

		return {
			hidden,
			monthlyValue: value,
			visible,
			yearlyValue: value === 0 ? 0 : Math.round(value * 0.7),
		};
	});

	let yearly = false;

	const setLabelState = () => {
		if (monthlyLabel) {
			monthlyLabel.style.transition = "opacity 0.25s ease";
			monthlyLabel.style.opacity = yearly ? "0.45" : "1";
		}
		if (yearlyLabel) {
			yearlyLabel.style.transition = "opacity 0.25s ease";
			yearlyLabel.style.opacity = yearly ? "1" : "0.45";
		}

		if (!knob) {
			return;
		}

		const travel = Math.max(
			toggleElement.clientWidth - knob.clientWidth - 4,
			0,
		);
		knob.style.transition = "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)";
		knob.style.transform = yearly
			? `translateX(${travel}px)`
			: "translateX(0px)";
	};

	const animatePrice = (node: PriceNode) => {
		const nextValue = yearly ? node.yearlyValue : node.monthlyValue;
		const nextText = `$${nextValue}`;
		if (node.visible.textContent?.trim() === nextText) {
			return;
		}

		const exitAnimation = node.visible.animate(
			[
				{ opacity: 1, transform: "translateY(0px)" },
				{ opacity: 0, transform: "translateY(-8px)" },
			],
			{ duration: 160, easing: "ease-out", fill: "forwards" },
		);

		exitAnimation.onfinish = () => {
			node.hidden.textContent = nextText;
			node.visible.textContent = nextText;
			node.visible.animate(
				[
					{ opacity: 0, transform: "translateY(8px)" },
					{ opacity: 1, transform: "translateY(0px)" },
				],
				{ duration: 220, easing: "ease-out", fill: "forwards" },
			);
		};
	};

	const toggle = (nextState?: boolean) => {
		yearly = typeof nextState === "boolean" ? nextState : !yearly;
		setLabelState();
		for (const node of priceNodes) {
			animatePrice(node);
		}
	};
	const onMonthly = () => toggle(false);
	const onYearly = () => toggle(true);
	const onSwitch = () => toggle();

	setLabelState();
	for (const target of monthlyTargets) {
		target.style.cursor = "pointer";
		target.addEventListener("click", onMonthly);
	}
	for (const target of yearlyTargets) {
		target.style.cursor = "pointer";
		target.addEventListener("click", onYearly);
	}
	toggleElement.addEventListener("click", onSwitch);

	return () => {
		for (const target of monthlyTargets) {
			target.removeEventListener("click", onMonthly);
		}
		for (const target of yearlyTargets) {
			target.removeEventListener("click", onYearly);
		}
		toggleElement.removeEventListener("click", onSwitch);
	};
}

function createMobileMenuItem(label: string, href: string) {
	const wrapper = document.createElement("div");
	wrapper.setAttribute("data-highlight", "true");
	wrapper.setAttribute("data-framer-component-type", "RichTextContainer");
	wrapper.setAttribute("data-framer-name", label);
	wrapper.tabIndex = 0;
	wrapper.style.justifyContent = "center";
	wrapper.style.setProperty("--framer-paragraph-spacing", "0px");

	const heading = document.createElement("h5");
	heading.className = "framer-text framer-styles-preset-1efpdce";
	heading.setAttribute("data-styles-preset", "AGwqkS8yv");
	heading.setAttribute("dir", "auto");

	const link = document.createElement("a");
	link.className = "framer-text framer-styles-preset-znu3gd";
	link.setAttribute("data-styles-preset", "HNT3wvBos");
	link.href = href;
	link.textContent = label;

	heading.append(link);
	wrapper.append(heading);
	return wrapper;
}

function initMobileMenu() {
	const mobileNav = document.querySelector<HTMLElement>(
		'[data-framer-name="Mobile (Closed)"]',
	);

	if (
		!(mobileNav instanceof HTMLElement) ||
		window.innerWidth > MOBILE_BREAKPOINT ||
		mobileNav.dataset.codexMobileInit
	) {
		return () => {};
	}

	const navElement = mobileNav;
	navElement.dataset.codexMobileInit = "true";

	const container = navElement.querySelector<HTMLElement>(
		'[data-framer-name="Container"]',
	);
	const trigger = navElement.querySelector<HTMLElement>(
		'[data-framer-name="Open"][tabindex="0"]',
	);
	const navbar = navElement.querySelector<HTMLElement>(
		'[data-framer-name="Navbar"]',
	);

	if (!container || !trigger || !navbar) {
		return () => {};
	}

	const line1 = trigger.querySelector<HTMLElement>(
		'[data-framer-name="Line 1"]',
	);
	const line2 = trigger.querySelector<HTMLElement>(
		'[data-framer-name="Line 2"]',
	);
	const line3 = trigger.querySelector<HTMLElement>(
		'[data-framer-name="Line 3"]',
	);

	const menu = document.createElement("div");
	menu.className = "framer-iqoqpc";
	menu.setAttribute("data-framer-name", "Menu");
	menu.style.display = "none";
	menu.style.flexDirection = "column";
	menu.style.gap = "20px";
	menu.style.transform = "none";
	menu.style.paddingTop = "24px";

	for (const item of MOBILE_MENU_LINKS) {
		menu.append(createMobileMenuItem(item.label, item.href));
	}

	const cta = document.createElement("div");
	cta.className = "framer-1bdz3gr";
	cta.setAttribute("data-framer-name", "CTA");
	cta.style.display = "none";
	cta.style.paddingTop = "24px";

	const ctaContainer = document.createElement("div");
	ctaContainer.className = "framer-128cmhy-container";

	const ctaLink = document.createElement("a");
	ctaLink.className =
		"framer-Rwptr framer-Wrt2t framer-v3tz1c framer-v-v3tz1c framer-1jxvqsy";
	ctaLink.setAttribute("data-framer-name", "Primary");
	ctaLink.href = "https://framer.link/CsDpB9T";
	ctaLink.target = "_blank";
	ctaLink.rel = "noopener";
	ctaLink.style.width = "100%";

	const ctaText = document.createElement("div");
	ctaText.className = "framer-15rnzrx";
	ctaText.setAttribute("data-framer-name", "Get started");
	ctaText.setAttribute("data-framer-component-type", "RichTextContainer");
	ctaText.style.justifyContent = "center";
	ctaText.style.setProperty("--framer-paragraph-spacing", "0px");

	const ctaParagraph = document.createElement("p");
	ctaParagraph.className = "framer-text framer-styles-preset-z62jgw";
	ctaParagraph.setAttribute("data-styles-preset", "fqtZzlFtC");
	ctaParagraph.setAttribute("dir", "auto");
	ctaParagraph.textContent = "Get started";

	ctaText.append(ctaParagraph);
	ctaLink.append(ctaText);
	ctaContainer.append(ctaLink);
	cta.append(ctaContainer);
	container.append(menu, cta);

	let open = false;

	const applyState = () => {
		menu.style.display = open ? "flex" : "none";
		cta.style.display = open ? "block" : "none";
		navElement.setAttribute(
			"data-framer-name",
			open ? "Mobile (Open)" : "Mobile (Closed)",
		);
		trigger.setAttribute("data-framer-name", open ? "Close" : "Open");
		trigger.setAttribute("aria-expanded", open ? "true" : "false");

		if (line1) {
			line1.style.transition = "transform 0.25s ease";
			line1.style.transform = open ? "rotate(45deg) translateY(4px)" : "none";
		}
		if (line2) {
			line2.style.transition = "opacity 0.25s ease";
			line2.style.opacity = open ? "0" : "1";
		}
		if (line3) {
			line3.style.transition = "transform 0.25s ease";
			line3.style.transform = open ? "rotate(-45deg) translateY(-4px)" : "none";
		}

		// Animate menu items in
		if (open) {
			const items = menu.children;
			for (let i = 0; i < items.length; i++) {
				const item = items[i] as HTMLElement;
				item.style.opacity = "0";
				item.style.transform = "translateY(10px)";
				setTimeout(() => {
					item.style.transition = "opacity 0.3s ease, transform 0.3s ease";
					item.style.opacity = "1";
					item.style.transform = "translateY(0)";
				}, 50 + i * 50);
			}
		}
	};

	const toggle = () => {
		open = !open;
		applyState();
	};

	const closeMenu = () => {
		open = false;
		applyState();
	};

	trigger.style.cursor = "pointer";
	trigger.addEventListener("click", toggle);
	for (const link of menu.querySelectorAll("a")) {
		link.addEventListener("click", closeMenu);
	}

	applyState();

	return () => {
		trigger.removeEventListener("click", toggle);
		for (const link of menu.querySelectorAll("a")) {
			link.removeEventListener("click", closeMenu);
		}
		menu.remove();
		cta.remove();
	};
}

function initHoverEffects() {
	// Add hover effects to interactive elements
	const interactiveElements = document.querySelectorAll<HTMLElement>(
		'a[data-framer-name], [data-highlight="true"]',
	);

	for (const element of interactiveElements) {
		if (element.dataset.codexHoverInit) continue;
		element.dataset.codexHoverInit = "true";

		// Skip if already has hover styles defined
		const hasHoverStyles = element.querySelector("[data-hover]");
		if (hasHoverStyles) continue;

		element.style.transition =
			element.style.transition || "transform 0.2s ease, opacity 0.2s ease";
	}

	return () => {};
}

function initSmoothScroll() {
	// Ensure smooth scrolling for anchor links
	const anchorLinks = document.querySelectorAll<HTMLAnchorElement>(
		'a[href^="#"], a[href^="/#"]',
	);

	const cleanups: Array<() => void> = [];

	for (const link of anchorLinks) {
		if (link.dataset.codexScrollInit) continue;
		link.dataset.codexScrollInit = "true";

		const onClick = (event: Event) => {
			const href = link.getAttribute("href");
			if (!href) return;

			const targetId = href.replace(/^\/?#/, "");
			const target = document.getElementById(targetId);

			if (target) {
				event.preventDefault();
				target.scrollIntoView({ behavior: "smooth", block: "start" });

				// Update URL without jumping
				if (window.history.pushState) {
					window.history.pushState(null, "", `#${targetId}`);
				}
			}
		};

		link.addEventListener("click", onClick);
		cleanups.push(() => link.removeEventListener("click", onClick));
	}

	return () => {
		for (const cleanup of cleanups) {
			cleanup();
		}
	};
}

export default function FramerTemplateEnhancer() {
	useEffect(() => {
		// Small delay to ensure DOM is fully rendered
		const timeoutId = setTimeout(() => {
			const cleanups = [
				initAppearAnimations(),
				initAccordion(),
				initNavScroll(),
				initAnimatedCounters(),
				initSectionVisibilityFixes(),
				initPricingToggle(),
				initMobileMenu(),
				initHoverEffects(),
				initSmoothScroll(),
			];

			return () => {
				for (const cleanup of cleanups) {
					cleanup();
				}
			};
		}, 50);

		return () => {
			clearTimeout(timeoutId);
		};
	}, []);

	return null;
}
