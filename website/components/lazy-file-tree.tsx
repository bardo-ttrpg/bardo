"use client";

import dynamic from "next/dynamic";
import type { FileTreeRoot } from "@/components/magicui/file-tree";
import { useOnceInView } from "./use-once-in-view";

const FileTree = dynamic(
	() => import("@/components/magicui/file-tree").then((mod) => mod.FileTree),
	{
		ssr: false,
	},
);

export default function LazyFileTree({
	root,
	defaultSelectedId,
	className,
}: {
	root: FileTreeRoot;
	defaultSelectedId?: string;
	className?: string;
}) {
	const { ref, isInView } = useOnceInView<HTMLDivElement>("420px 0px");

	return (
		<div ref={ref}>
			{isInView ? (
				<FileTree
					root={root}
					defaultSelectedId={defaultSelectedId}
					className={className}
				/>
			) : (
				<div
					className="h-[420px] w-full animate-pulse border border-border bg-linear-to-br from-muted/5 via-muted/10 to-muted/5"
					aria-hidden
				/>
			)}
		</div>
	);
}
