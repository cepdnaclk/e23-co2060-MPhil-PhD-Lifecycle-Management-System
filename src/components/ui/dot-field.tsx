"use client";

import { memo, useEffect, useId, useRef, type HTMLAttributes } from "react";

import styles from "./dot-field.module.css";

const TWO_PI = Math.PI * 2;

type DotFieldProps = HTMLAttributes<HTMLDivElement> & {
  dotRadius?: number;
  dotSpacing?: number;
  cursorRadius?: number;
  cursorForce?: number;
  bulgeOnly?: boolean;
  bulgeStrength?: number;
  glowRadius?: number;
  sparkle?: boolean;
  waveAmplitude?: number;
  gradientFrom?: string;
  gradientTo?: string;
  activeGradientStops?: string[];
  activeDotScale?: number;
  idleEngagement?: number;
  glowColor?: string;
};

type Dot = {
  ax: number;
  ay: number;
  sx: number;
  sy: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

type MouseState = {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  speed: number;
  isInside: boolean;
};

type SizeState = {
  w: number;
  h: number;
  offsetX: number;
  offsetY: number;
};

const DotField = memo(function DotField({
  dotRadius = 1.5,
  dotSpacing = 14,
  cursorRadius = 500,
  cursorForce = 0.1,
  bulgeOnly = true,
  bulgeStrength = 67,
  glowRadius = 160,
  sparkle = false,
  waveAmplitude = 0,
  gradientFrom = "rgba(168, 85, 247, 0.35)",
  gradientTo = "rgba(180, 151, 207, 0.25)",
  activeGradientStops = [
    "rgba(239, 68, 68, 0.96)",
    "rgba(244, 114, 182, 0.95)",
    "rgba(96, 165, 250, 0.95)",
    "rgba(168, 85, 247, 0.94)",
  ],
  activeDotScale = 2.25,
  idleEngagement = 0.5,
  glowColor = "#120F17",
  className = "",
  ...rest
}: DotFieldProps) {
  const glowId = `dot-field-glow-${useId().replace(/:/g, "")}`;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowRef = useRef<SVGCircleElement | null>(null);
  const dotsRef = useRef<Dot[]>([]);
  const mouseRef = useRef<MouseState>({
    x: -9999,
    y: -9999,
    prevX: -9999,
    prevY: -9999,
    speed: 0,
    isInside: false,
  });
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef<SizeState>({ w: 0, h: 0, offsetX: 0, offsetY: 0 });
  const glowOpacityRef = useRef(0);
  const engagementRef = useRef(0);
  const propsRef = useRef({
    dotRadius,
    dotSpacing,
    cursorRadius,
    cursorForce,
    bulgeOnly,
    bulgeStrength,
    sparkle,
    waveAmplitude,
    gradientFrom,
    gradientTo,
    activeGradientStops,
    activeDotScale,
    idleEngagement,
  });
  const rebuildRef = useRef<(() => void) | null>(null);
  propsRef.current = {
    dotRadius,
    dotSpacing,
    cursorRadius,
    cursorForce,
    bulgeOnly,
    bulgeStrength,
    sparkle,
    waveAmplitude,
    gradientFrom,
    gradientTo,
    activeGradientStops,
    activeDotScale,
    idleEngagement,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const glowElement = glowRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const buildDots = (width: number, height: number) => {
      const currentProps = propsRef.current;
      const step = currentProps.dotRadius + currentProps.dotSpacing;
      const cols = Math.floor(width / step);
      const rows = Math.floor(height / step);
      const padX = (width % step) / 2;
      const padY = (height % step) / 2;
      const dots = new Array<Dot>(rows * cols);
      let index = 0;

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const ax = padX + col * step + step / 2;
          const ay = padY + row * step + step / 2;
          dots[index] = { ax, ay, sx: ax, sy: ay, vx: 0, vy: 0, x: ax, y: ay };
          index += 1;
        }
      }

      dotsRef.current = dots;
    };

    const doResize = () => {
      const parent = canvas.parentElement;
      if (!parent) {
        return;
      }

      const rect = parent.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      sizeRef.current = {
        w: width,
        h: height,
        offsetX: rect.left + window.scrollX,
        offsetY: rect.top + window.scrollY,
      };

      buildDots(width, height);
    };

    const resize = () => {
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }

      resizeTimer = setTimeout(doResize, 100);
    };

    const onMouseMove = (event: MouseEvent) => {
      const size = sizeRef.current;
      const x = event.pageX - size.offsetX;
      const y = event.pageY - size.offsetY;

      mouseRef.current.x = x;
      mouseRef.current.y = y;
      mouseRef.current.isInside = x >= 0 && x <= size.w && y >= 0 && y <= size.h;
    };

    const onWindowLeave = () => {
      mouseRef.current.isInside = false;
    };

    const updateMouseSpeed = () => {
      const mouse = mouseRef.current;
      const dx = mouse.prevX - mouse.x;
      const dy = mouse.prevY - mouse.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      mouse.speed += (distance - mouse.speed) * 0.5;
      if (mouse.speed < 0.001) {
        mouse.speed = 0;
      }
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
    };

    const speedInterval = window.setInterval(updateMouseSpeed, 20);
    let frameCount = 0;

    const tick = () => {
      frameCount += 1;

      const dots = dotsRef.current;
      const mouse = mouseRef.current;
      const { w, h } = sizeRef.current;
      const currentProps = propsRef.current;
      const time = frameCount * 0.02;

      const movingEngagement = Math.min(mouse.speed / 5, 1);
      const targetEngagement = mouse.isInside
        ? Math.max(currentProps.idleEngagement, movingEngagement)
        : 0;
      engagementRef.current += (targetEngagement - engagementRef.current) * 0.06;
      if (engagementRef.current < 0.001) {
        engagementRef.current = 0;
      }
      const engagement = engagementRef.current;

      glowOpacityRef.current += (engagement - glowOpacityRef.current) * 0.08;

      if (glowElement) {
        glowElement.setAttribute("cx", String(mouse.x));
        glowElement.setAttribute("cy", String(mouse.y));
        glowElement.style.opacity = String(glowOpacityRef.current);
      }

      context.clearRect(0, 0, w, h);

      const cursorRadiusSquared = currentProps.cursorRadius * currentProps.cursorRadius;
      const radius = currentProps.dotRadius / 2;
      const bulgeMode = currentProps.bulgeOnly;

      for (let index = 0; index < dots.length; index += 1) {
        const dot = dots[index];
        const dx = mouse.x - dot.ax;
        const dy = mouse.y - dot.ay;
        const distanceSquared = dx * dx + dy * dy;
        const insideCursor = distanceSquared < cursorRadiusSquared && engagement > 0.01;

        if (insideCursor) {
          const distance = Math.sqrt(distanceSquared);

          if (bulgeMode) {
            const strength = 1 - distance / currentProps.cursorRadius;
            const push = strength * strength * currentProps.bulgeStrength * engagement;
            const angle = Math.atan2(dy, dx);
            dot.sx += (dot.ax - Math.cos(angle) * push - dot.sx) * 0.15;
            dot.sy += (dot.ay - Math.sin(angle) * push - dot.sy) * 0.15;
          } else {
            const angle = Math.atan2(dy, dx);
            const move = (500 / Math.max(distance, 0.001)) * (mouse.speed * currentProps.cursorForce);
            dot.vx += Math.cos(angle) * -move;
            dot.vy += Math.sin(angle) * -move;
          }
        } else if (bulgeMode) {
          dot.sx += (dot.ax - dot.sx) * 0.1;
          dot.sy += (dot.ay - dot.sy) * 0.1;
        }

        if (!bulgeMode) {
          dot.vx *= 0.9;
          dot.vy *= 0.9;
          dot.x = dot.ax + dot.vx;
          dot.y = dot.ay + dot.vy;
          dot.sx += (dot.x - dot.sx) * 0.1;
          dot.sy += (dot.y - dot.sy) * 0.1;
        }

        let drawX = dot.sx;
        let drawY = dot.sy;

        if (currentProps.waveAmplitude > 0) {
          drawY += Math.sin(dot.ax * 0.03 + time) * currentProps.waveAmplitude;
          drawX += Math.cos(dot.ay * 0.03 + time * 0.7) * currentProps.waveAmplitude * 0.5;
        }

        const distance = Math.sqrt(distanceSquared);
        const intensity = insideCursor
          ? (1 - Math.min(distance / currentProps.cursorRadius, 1)) * engagement
          : 0;
        const dotScale = 1 + intensity * (currentProps.activeDotScale - 1);
        const baseFill = context.createLinearGradient(0, 0, w, h);
        baseFill.addColorStop(0, currentProps.gradientFrom);
        baseFill.addColorStop(1, currentProps.gradientTo);
        const activeFill = context.createLinearGradient(
          drawX - radius * dotScale,
          drawY - radius * dotScale,
          drawX + radius * dotScale,
          drawY + radius * dotScale,
        );
        const stops = currentProps.activeGradientStops;
        const stopCount = Math.max(stops.length - 1, 1);
        stops.forEach((stop, stopIndex) => {
          activeFill.addColorStop(stopIndex / stopCount, stop);
        });

        if (currentProps.sparkle) {
          const hash = ((index * 2654435761) ^ (frameCount >> 3)) >>> 0;
          const sparkleRadius = ((hash % 100) < 3 ? radius * 1.8 : radius) * dotScale;
          context.beginPath();
          context.fillStyle = intensity > 0 ? activeFill : baseFill;
          context.arc(drawX, drawY, sparkleRadius, 0, TWO_PI);
          context.fill();
        } else {
          context.beginPath();
          context.fillStyle = intensity > 0 ? activeFill : baseFill;
          context.arc(drawX, drawY, radius * dotScale, 0, TWO_PI);
          context.fill();
        }
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    doResize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseleave", onWindowLeave);
    rafRef.current = window.requestAnimationFrame(tick);

    rebuildRef.current = () => {
      const { w, h } = sizeRef.current;
      if (w > 0 && h > 0) {
        buildDots(w, h);
      }
    };

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      window.clearInterval(speedInterval);
      if (resizeTimer) {
        clearTimeout(resizeTimer);
      }
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onWindowLeave);
    };
  }, []);

  useEffect(() => {
    rebuildRef.current?.();
  }, [dotRadius, dotSpacing]);

  return (
    <div className={`${styles.container} ${className}`.trim()} {...rest}>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0%" stopColor={glowColor} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <circle
          ref={glowRef}
          cx="-9999"
          cy="-9999"
          r={glowRadius}
          fill={`url(#${glowId})`}
          style={{ opacity: 0, willChange: "opacity" }}
        />
      </svg>
    </div>
  );
});

export default DotField;
