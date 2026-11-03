export const ToolId = {
  Pointer: "pointer",
  Brush: "brush",
  Eraser: "eraser",
} as const;

export type ToolId = (typeof ToolId)[keyof typeof ToolId];
