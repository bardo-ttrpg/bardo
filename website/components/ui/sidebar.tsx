"use client";

import { PanelLeft } from "lucide-react";
import Link from "next/link";
import {
	createContext,
	type HTMLAttributes,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
	openMobile: boolean;
	setOpenMobile(next: boolean): void;
	toggleMobile(): void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function useSidebarContext() {
	const value = useContext(SidebarContext);
	if (!value) {
		throw new Error("Sidebar components must be used inside SidebarProvider.");
	}
	return value;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
	const [openMobile, setOpenMobile] = useState(false);
	const value = useMemo(
		() => ({
			openMobile,
			setOpenMobile,
			toggleMobile: () => setOpenMobile((current) => !current),
		}),
		[openMobile],
	);

	return (
		<SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
	);
}

export function Sidebar({ children, className }: HTMLAttributes<HTMLElement>) {
	const { openMobile, setOpenMobile } = useSidebarContext();

	return (
		<>
			<div
				aria-hidden={openMobile ? "false" : "true"}
				className={cn(
					"fixed inset-0 z-30 bg-background/80 transition-opacity md:hidden",
					openMobile ? "opacity-100" : "pointer-events-none opacity-0",
				)}
				onClick={() => setOpenMobile(false)}
			/>
			<aside
				className={cn(
					"font-ui fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-background text-foreground transition-transform md:sticky md:top-0 md:z-0 md:h-screen md:translate-x-0",
					openMobile ? "translate-x-0" : "-translate-x-full",
					className,
				)}
			>
				{children}
			</aside>
		</>
	);
}

export function SidebarHeader({
	children,
	className,
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn("flex flex-col gap-4 p-4", className)}>{children}</div>
	);
}

export function SidebarContent({
	children,
	className,
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn("flex-1 overflow-y-auto p-4 pt-0", className)}>
			{children}
		</div>
	);
}

export function SidebarInset({
	children,
	className,
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn("flex min-h-screen flex-1 flex-col md:pl-0", className)}>
			{children}
		</div>
	);
}

export function SidebarTrigger({ className }: { className?: string }) {
	const { toggleMobile } = useSidebarContext();

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className={cn("md:hidden", className)}
			onClick={toggleMobile}
			aria-label="Toggle docs navigation"
		>
			<PanelLeft className="size-4" />
		</Button>
	);
}

export function SidebarGroup({
	children,
	className,
}: HTMLAttributes<HTMLDivElement>) {
	return <section className={cn("space-y-3", className)}>{children}</section>;
}

export function SidebarGroupLabel({
	children,
	className,
}: HTMLAttributes<HTMLParagraphElement>) {
	return (
		<p className={cn("ui-label text-muted-foreground", className)}>
			{children}
		</p>
	);
}

export function SidebarMenu({
	children,
	className,
}: HTMLAttributes<HTMLUListElement>) {
	return <ul className={cn("space-y-1 pl-0", className)}>{children}</ul>;
}

export function SidebarMenuItem({
	children,
	className,
}: HTMLAttributes<HTMLLIElement>) {
	return <li className={cn("list-none", className)}>{children}</li>;
}

export function SidebarMenuButton({
	children,
	className,
	isActive = false,
	href,
}: {
	children: ReactNode;
	className?: string;
	isActive?: boolean;
	href: string;
}) {
	const { setOpenMobile } = useSidebarContext();

	return (
		<Link
			href={href}
			onClick={() => setOpenMobile(false)}
			className={cn(
				"ui-nav flex w-full items-center justify-between border border-transparent px-3 py-2 text-foreground transition-colors hover:border-border hover:bg-subtle",
				isActive ? "border-border bg-subtle" : undefined,
				className,
			)}
		>
			{children}
		</Link>
	);
}
