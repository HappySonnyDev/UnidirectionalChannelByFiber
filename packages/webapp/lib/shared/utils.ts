import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * JSON.stringify with BigInt support
 */
export const jsonStr = (
  obj: unknown,
  replacer?: ((key: string, value: unknown) => unknown) | null,
  space?: string | number,
) => {
  const customReplacer = (key: string, value: unknown) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    // If a custom replacer is provided, apply it after bigint handling
    return replacer ? replacer(key, value) : value;
  };

  return JSON.stringify(obj, replacer || customReplacer, space);
};
