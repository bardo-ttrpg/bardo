import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"ui-button inline-flex items-center justify-center border border-border bg-transparent text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				default: "hover:bg-subtle",
				ghost: "border-transparent hover:border-border hover:bg-subtle",
				outline: "hover:bg-subtle",
				link: "border-transparent p-0 underline underline-offset-4 hover:bg-transparent",
			},
			size: {
				default: "min-h-10 px-4 py-2",
				sm: "min-h-9 px-3 py-2",
				icon: "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
		children: ReactNode;
	};

export function Button({
	className,
	variant,
	size,
	asChild = false,
	children,
	...props
}: ButtonProps) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		>
			{children}
		</Comp>
	);
}
