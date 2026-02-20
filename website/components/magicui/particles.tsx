"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ParticlesProps {
	className?: string;
	quantity?: number;
	staticity?: number;
	ease?: number;
	size?: number;
	color?: string;
	vx?: number;
	vy?: number;
}

function hexToRgb(hex: string): [number, number, number] {
	hex = hex.replace("#", "");
	if (hex.length === 3)
		hex = hex
			.split("")
			.map((c) => c + c)
			.join("");
	const r = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return r?.[1] && r[2] && r[3]
		? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)]
		: [255, 255, 255];
}

type Circle = {
	x: number;
	y: number;
	tx: number;
	ty: number;
	size: number;
	alpha: number;
	targetAlpha: number;
	dx: number;
	dy: number;
	magnetism: number;
};

export default function Particles({
	className = "",
	quantity = 60,
	staticity = 50,
	ease = 50,
	size = 0.4,
	color = "#ffffff",
	vx = 0,
	vy = 0,
}: ParticlesProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const ctx = useRef<CanvasRenderingContext2D | null>(null);
	const circles = useRef<Circle[]>([]);
	const mouse = useRef({ x: 0, y: 0 });
	const canvasSize = useRef({ w: 0, h: 0 });
	const raf = useRef<number>(0);
	const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 1;
	const rgb = hexToRgb(color);

	// biome-ignore lint/correctness/useExhaustiveDependencies: init is intentionally re-registered on color changes only.
	useEffect(() => {
		if (canvasRef.current) ctx.current = canvasRef.current.getContext("2d");
		init();
		window.addEventListener("resize", init);
		return () => {
			window.removeEventListener("resize", init);
			cancelAnimationFrame(raf.current);
		};
	}, [color]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const onMove = (e: MouseEvent) => {
			const rect = el.getBoundingClientRect();
			const { w, h } = canvasSize.current;
			const x = e.clientX - rect.left - w / 2;
			const y = e.clientY - rect.top - h / 2;
			if (Math.abs(x) < w / 2 && Math.abs(y) < h / 2) {
				mouse.current = { x, y };
			}
		};
		window.addEventListener("mousemove", onMove);
		return () => window.removeEventListener("mousemove", onMove);
	}, []);

	function init() {
		if (!containerRef.current || !canvasRef.current || !ctx.current) return;
		circles.current = [];
		canvasSize.current.w = containerRef.current.offsetWidth;
		canvasSize.current.h = containerRef.current.offsetHeight;
		canvasRef.current.width = canvasSize.current.w * dpr;
		canvasRef.current.height = canvasSize.current.h * dpr;
		canvasRef.current.style.width = `${canvasSize.current.w}px`;
		canvasRef.current.style.height = `${canvasSize.current.h}px`;
		ctx.current.scale(dpr, dpr);
		for (let i = 0; i < quantity; i++) spawn();
		cancelAnimationFrame(raf.current);
		raf.current = requestAnimationFrame(tick);
	}

	function spawn() {
		const { w, h } = canvasSize.current;
		const c: Circle = {
			x: Math.random() * w,
			y: Math.random() * h,
			tx: 0,
			ty: 0,
			size: Math.random() * 1.5 + size,
			alpha: 0,
			targetAlpha: parseFloat((Math.random() * 0.4 + 0.05).toFixed(2)),
			dx: (Math.random() - 0.5) * 0.08,
			dy: (Math.random() - 0.5) * 0.08,
			magnetism: 0.1 + Math.random() * 3,
		};
		draw(c);
	}

	function draw(c: Circle, update = false) {
		if (!ctx.current) return;
		ctx.current.translate(c.tx, c.ty);
		ctx.current.beginPath();
		ctx.current.arc(c.x, c.y, c.size, 0, Math.PI * 2);
		ctx.current.fillStyle = `rgba(${rgb.join(",")},${c.alpha})`;
		ctx.current.fill();
		ctx.current.setTransform(dpr, 0, 0, dpr, 0, 0);
		if (!update) circles.current.push(c);
	}

	function tick() {
		if (!ctx.current) return;
		ctx.current.clearRect(0, 0, canvasSize.current.w, canvasSize.current.h);
		for (let i = circles.current.length - 1; i >= 0; i--) {
			const c = circles.current[i];
			if (!c) continue;
			const edge = [
				c.x + c.tx - c.size,
				canvasSize.current.w - c.x - c.tx - c.size,
				c.y + c.ty - c.size,
				canvasSize.current.h - c.y - c.ty - c.size,
			];
			const closest = Math.min(...edge);
			const fade = Math.min(closest / 20, 1);
			c.alpha = Math.min(c.alpha + 0.02, c.targetAlpha * fade);
			c.x += c.dx + vx;
			c.y += c.dy + vy;
			c.tx += (mouse.current.x / (staticity / c.magnetism) - c.tx) / ease;
			c.ty += (mouse.current.y / (staticity / c.magnetism) - c.ty) / ease;
			draw(c, true);
			if (
				c.x < -c.size ||
				c.x > canvasSize.current.w + c.size ||
				c.y < -c.size ||
				c.y > canvasSize.current.h + c.size
			) {
				circles.current.splice(i, 1);
				spawn();
			}
		}
		raf.current = requestAnimationFrame(tick);
	}

	return (
		<div
			ref={containerRef}
			className={cn("pointer-events-none", className)}
			aria-hidden
		>
			<canvas ref={canvasRef} className="size-full" />
		</div>
	);
}
