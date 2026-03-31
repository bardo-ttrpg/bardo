import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
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
		h2: (props: ComponentPropsWithoutRef<"h2">) => (
			<h2
				className={cn(
					"font-reading-heading text-3xl text-foreground",
					props.className,
				)}
				{...props}
			/>
		),
		h3: (props: ComponentPropsWithoutRef<"h3">) => (
			<h3
				className={cn(
					"font-reading-heading text-2xl text-foreground",
					props.className,
				)}
				{...props}
			/>
		),
		p: (props: ComponentPropsWithoutRef<"p">) => (
			<p
				className={cn("font-reading-body text-foreground", props.className)}
				{...props}
			/>
		),
		a: ({ href, className, ...props }: ComponentPropsWithoutRef<"a">) => {
			const linkClassName = cn(
				"font-reading-body underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground",
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
					"font-reading-body list-disc space-y-2 pl-6 text-foreground",
					props.className,
				)}
				{...props}
			/>
		),
		ol: (props: ComponentPropsWithoutRef<"ol">) => (
			<ol
				className={cn(
					"font-reading-body list-decimal space-y-2 pl-6 text-foreground",
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
					"border-l border-border pl-4 font-reading-body text-foreground",
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
					"technical-meta overflow-x-auto border border-border bg-subtle p-4 text-foreground",
					props.className,
				)}
				{...props}
			/>
		),
		Lore,
		...components,
	};
}
