import Link from "next/link";
import {
	type ComponentPropsWithoutRef,
	createElement,
	type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

function Lore({ children }: { children?: ReactNode }) {
	return <span className="lore-fragment">{children}</span>;
}

type ComponentsMap = Record<
	string,
	(props: Record<string, unknown> & { children?: ReactNode }) => ReactNode
>;

function isInternalHref(href: string | undefined) {
	return Boolean(href?.startsWith("/")) || Boolean(href?.startsWith("#"));
}

function getTextContent(children: ReactNode): string {
	if (typeof children === "string" || typeof children === "number") {
		return String(children);
	}

	if (Array.isArray(children)) {
		return children.map((child) => getTextContent(child)).join(" ");
	}

	if (children && typeof children === "object" && "props" in children) {
		return getTextContent(
			(children.props as { children?: ReactNode }).children,
		);
	}

	return "";
}

function slugifyHeading(children: ReactNode) {
	return getTextContent(children)
		.toLowerCase()
		.trim()
		.replace(/['"`]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function createHeading<Tag extends "h2" | "h3">(
	tag: Tag,
	baseClassName: string,
) {
	return function Heading({
		children,
		className,
		id,
		...props
	}: ComponentPropsWithoutRef<Tag>) {
		const resolvedId = id ?? slugifyHeading(children);

		return createElement(
			tag,
			{
				id: resolvedId,
				className: cn(
					"group/heading scroll-mt-24 tracking-[-0.03em]",
					baseClassName,
					className,
				),
				...props,
			},
			createElement(
				"a",
				{
					href: `#${resolvedId}`,
					className: "inline-flex items-center gap-2 no-underline",
				},
				createElement("span", null, children),
				createElement(
					"span",
					{
						"aria-hidden": "true",
						className:
							"ui-label opacity-0 transition-opacity group-hover/heading:opacity-100",
					},
					"#",
				),
			),
		);
	};
}

export function useMDXComponents(
	components: ComponentsMap = {},
): ComponentsMap {
	return {
		h1: (props: ComponentPropsWithoutRef<"h1">) => (
			<h1
				className={cn(
					"font-reading-heading text-4xl text-foreground sm:text-5xl",
					props.className,
				)}
				{...props}
			/>
		),
		h2: createHeading(
			"h2",
			"font-reading-heading mt-10 text-3xl text-foreground sm:text-[2rem]",
		),
		h3: createHeading(
			"h3",
			"font-reading-heading mt-8 text-2xl text-foreground sm:text-[1.65rem]",
		),
		p: (props: ComponentPropsWithoutRef<"p">) => (
			<p
				className={cn(
					"font-reading-body text-[0.98rem] leading-7 text-foreground/88",
					props.className,
				)}
				{...props}
			/>
		),
		a: ({ href, className, ...props }: ComponentPropsWithoutRef<"a">) => {
			const linkClassName = cn(
				"font-reading-body underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground",
				className,
			);

			if (isInternalHref(href)) {
				return <Link href={href ?? "/"} className={linkClassName} {...props} />;
			}

			return (
				<a
					href={href}
					className={linkClassName}
					rel={props.target === "_blank" ? "noreferrer" : props.rel}
					{...props}
				/>
			);
		},
		ul: (props: ComponentPropsWithoutRef<"ul">) => (
			<ul
				className={cn(
					"font-reading-body list-disc space-y-2.5 pl-6 text-foreground/88",
					props.className,
				)}
				{...props}
			/>
		),
		ol: (props: ComponentPropsWithoutRef<"ol">) => (
			<ol
				className={cn(
					"font-reading-body list-decimal space-y-2.5 pl-6 text-foreground/88",
					props.className,
				)}
				{...props}
			/>
		),
		li: (props: ComponentPropsWithoutRef<"li">) => (
			<li
				className={cn("font-reading-body text-foreground", props.className)}
				{...props}
			/>
		),
		blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
			<blockquote
				className={cn(
					"rounded-r-xl border-l-2 border-border bg-muted/30 px-5 py-4 font-reading-body text-foreground/90",
					props.className,
				)}
				{...props}
			/>
		),
		hr: (props: ComponentPropsWithoutRef<"hr">) => (
			<hr
				className={cn("border-0 border-t border-border", props.className)}
				{...props}
			/>
		),
		code: (props: ComponentPropsWithoutRef<"code">) => {
			const isBlockCode = props.className?.includes("language-");

			return (
				<code
					className={cn(
						isBlockCode
							? "font-code text-foreground"
							: "code-inline text-foreground",
						props.className,
					)}
					{...props}
				/>
			);
		},
		pre: (props: ComponentPropsWithoutRef<"pre">) => (
			<pre
				className={cn(
					"technical-meta overflow-x-auto border border-border bg-muted/45 p-4 text-foreground",
					props.className,
				)}
				{...props}
			/>
		),
		Lore,
		...components,
	};
}
