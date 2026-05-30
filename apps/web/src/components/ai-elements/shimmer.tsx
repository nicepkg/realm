"use client";

import type { MotionProps } from "motion/react";
import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ElementType, JSX } from "react";
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

type MotionHTMLProps = MotionProps & Record<string, unknown>;

// Cache motion components at module level to avoid creating during render
const motionComponentCache = new Map<
  keyof JSX.IntrinsicElements,
  React.ComponentType<MotionHTMLProps>
>();

const getMotionComponent = (element: keyof JSX.IntrinsicElements) => {
  let component = motionComponentCache.get(element);
  if (!component) {
    component = motion.create(element);
    motionComponentCache.set(element, component);
  }
  return component;
};

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const MotionComponent = getMotionComponent(Component as keyof JSX.IntrinsicElements);
  // Hard taste rule: the infinite background sweep below is a JS/WAAPI animation
  // driven by motion. The global CSS `prefers-reduced-motion` guard cannot stop a
  // JS-driven animation, so Shimmer must self-guard. When reduced motion is on we
  // render static muted text with no MotionComponent and no infinite sweep.
  const shouldReduceMotion = useReducedMotion();

  const dynamicSpread = useMemo(() => (children?.length ?? 0) * spread, [children, spread]);

  if (shouldReduceMotion) {
    // Static fallback. Keep the same muted text color/size as the animated path's
    // resting state (`--color-muted-foreground`) so enabling reduced motion never
    // shifts layout or changes the placeholder's perceived weight.
    return (
      <Component
        className={cn("inline-block text-[color:var(--color-muted-foreground)]", className)}
        data-reduced-motion="true"
      >
        {children}
      </Component>
    );
  }

  return (
    <MotionComponent
      animate={{ backgroundPosition: "0% center" }}
      className={cn(
        "relative inline-block bg-[length:250%_100%,auto] bg-clip-text text-transparent",
        "[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
        className,
      )}
      initial={{ backgroundPosition: "100% center" }}
      style={
        {
          "--spread": `${dynamicSpread}px`,
          backgroundImage:
            "var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
        } as CSSProperties
      }
      transition={{
        duration,
        ease: "linear",
        repeat: Number.POSITIVE_INFINITY,
      }}
    >
      {children}
    </MotionComponent>
  );
};

export const Shimmer = memo(ShimmerComponent);
