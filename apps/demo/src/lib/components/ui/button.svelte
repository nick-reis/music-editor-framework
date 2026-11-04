<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  let {
    children,
    class: className = "",
    variant = "default",
    size = "default",
    type = "button",
    ...rest
  }: {
    class?: string;
    children?: Snippet;
    variant?: "default" | "outline" | "ghost";
    size?: "default" | "sm" | "icon";
    type?: "button" | "submit" | "reset";
    [key: string]: unknown;
  } = $props();

  const variants = {
    default: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-white",
    outline: "border border-[var(--border)] bg-transparent hover:bg-[var(--muted)]",
    ghost: "hover:bg-[var(--muted)] hover:text-white"
  };

  const sizes = {
    default: "h-9 px-4",
    sm: "h-8 px-3 text-xs",
    icon: "h-9 w-9"
  };
</script>

<button
  {...rest}
  {type}
  class={cn(
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className
  )}
>
  {@render children?.()}
</button>
