"use client";

import { ChevronRight, File, FileText, Folder, FolderOpen } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";

/* ── Context ── */
interface TreeContextValue {
	selectedId: string | null;
	setSelectedId: (id: string | null) => void;
}
const TreeCtx = createContext<TreeContextValue>({
	selectedId: null,
	setSelectedId: () => {},
});

/* ── Types ── */
export interface FileTreeNode {
	id: string;
	name: string;
	type: "file" | "folder";
	highlight?: boolean;
	note?: string;
	children?: FileTreeNode[];
}

/* ── File node ── */
function FileNode({ node, depth }: { node: FileTreeNode; depth: number }) {
	const { selectedId, setSelectedId } = useContext(TreeCtx);
	const isSelected = selectedId === node.id || node.highlight;
	const isMd = node.name.endsWith(".md");

	return (
		<button
			type="button"
			onClick={() => setSelectedId(isSelected ? null : node.id)}
			aria-pressed={isSelected}
			aria-label={`Inspect ${node.name}`}
			className={cn(
				"flex w-full items-center gap-2 px-2 py-[5px] text-left transition-colors hover:bg-foreground/5",
				isSelected && "bg-foreground/10",
			)}
			style={{ paddingLeft: `${depth * 14 + 8}px` }}
		>
			{isMd ? (
				<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
			) : (
				<File className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
			)}
			<span
				className={cn(
					"font-mono text-xs",
					isSelected ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{node.name}
			</span>
			{node.note && (
				<span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/40">
					{node.note}
				</span>
			)}
			{node.highlight && (
				<span className="ml-1 shrink-0 border border-green-500/30 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-green-400/70">
					active
				</span>
			)}
		</button>
	);
}

/* ── Folder node ── */
function FolderNode({
	node,
	depth,
	defaultOpen = false,
}: {
	node: FileTreeNode;
	depth: number;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(() => defaultOpen);

	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
				className="flex w-full items-center gap-2 px-2 py-[5px] transition-colors hover:bg-foreground/5"
				style={{ paddingLeft: `${depth * 14 + 8}px` }}
			>
				<ChevronRight
					className={cn(
						"h-3 w-3 shrink-0 text-muted-foreground/40 transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				{open ? (
					<FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
				) : (
					<Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
				)}
				<span className="font-mono text-xs text-foreground/75">
					{node.name}
					<span className="text-border/60">/</span>
				</span>
				{node.note && (
					<span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/40">
						{node.note}
					</span>
				)}
			</button>

			{open &&
				node.children?.map((child) =>
					child.type === "folder" ? (
						<FolderNode
							key={child.id}
							node={child}
							depth={depth + 1}
							defaultOpen={false}
						/>
					) : (
						<FileNode key={child.id} node={child} depth={depth + 1} />
					),
				)}
		</div>
	);
}

/* ── Root ── */
export interface FileTreeRoot {
	name: string;
	note?: string;
	children: FileTreeNode[];
}

export function FileTree({
	root,
	defaultSelectedId,
	className,
}: {
	root: FileTreeRoot;
	defaultSelectedId?: string;
	className?: string;
}) {
	const [selectedId, setSelectedId] = useState<string | null>(
		defaultSelectedId ?? null,
	);

	return (
		<TreeCtx.Provider value={{ selectedId, setSelectedId }}>
			<div
				className={cn(
					"overflow-auto border border-border bg-background/80 py-2",
					className,
				)}
			>
				{/* Workspace root label */}
				<div className="flex items-center gap-2 px-3 pb-1.5">
					<FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
					<span className="font-mono text-xs text-foreground/80">
						{root.name}
					</span>
					{root.note && (
						<span className="font-mono text-[10px] text-muted-foreground/40">
							{root.note}
						</span>
					)}
				</div>

				{root.children.map((node) =>
					node.type === "folder" ? (
						<FolderNode
							key={node.id}
							node={node}
							depth={0}
							defaultOpen={true}
						/>
					) : (
						<FileNode key={node.id} node={node} depth={0} />
					),
				)}
			</div>
		</TreeCtx.Provider>
	);
}
