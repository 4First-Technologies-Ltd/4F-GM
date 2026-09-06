import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Brand marks. Both theme variants are rendered and swapped with CSS on the
 * `.dark` class, so the right one is painted on first paint — no JS, no flash,
 * and it works in server components.
 *
 * `LogoEmblem` — square badge, cropped from the full lockups. For tight spots.
 * `LogoLockup` — full logo with the wordmark. Needs room to stay legible.
 */
const ON_DARK = "hidden dark:block"; // the pale variant, shown in dark theme
const ON_LIGHT = "block dark:hidden"; // the green variant, shown in light theme

export function LogoEmblem({
  className,
  size = 36,
  priority = false,
}: {
  className?: string;
  size?: number;
  priority?: boolean;
}) {
  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src="/images/logo-files/emblem-light-theme.png"
        alt=""
        aria-hidden
        width={size}
        height={size}
        priority={priority}
        className={ON_LIGHT}
      />
      <Image
        src="/images/logo-files/emblem-dark-theme.png"
        alt=""
        aria-hidden
        width={size}
        height={size}
        priority={priority}
        className={cn(ON_DARK, "absolute inset-0")}
      />
    </span>
  );
}

export function LogoLockup({
  className,
  width = 176,
  priority = false,
}: {
  className?: string;
  width?: number;
  priority?: boolean;
}) {
  // Source lockups are 1288 × 896.
  const height = Math.round((width * 896) / 1288);
  return (
    <span
      className={cn("relative inline-block", className)}
      style={{ width, height }}
    >
      <Image
        src="/images/logo-files/FullLogo_Transparent_light-theme.png"
        alt="4FG Monitor"
        width={width}
        height={height}
        priority={priority}
        className={cn(ON_LIGHT, "h-auto w-full")}
      />
      <Image
        src="/images/logo-files/FullLogo_Transparent_dark-theme.png"
        alt="4FG Monitor"
        width={width}
        height={height}
        priority={priority}
        className={cn(ON_DARK, "absolute inset-0 h-auto w-full")}
      />
    </span>
  );
}
