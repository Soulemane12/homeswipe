"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Listing photo with a graceful fallback: if the remote image fails, a quiet generated
 * placeholder (not a stock photo) is shown instead of a broken image.
 */
export function PropertyImage({
  src,
  alt,
  sizes,
  priority,
  className,
}: {
  src?: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div role="img" aria-label={alt} className={cn("absolute inset-0 flex items-end bg-gradient-to-br from-secondary to-accent", className)}>
        <svg viewBox="0 0 120 80" className="h-full w-full text-primary/15" aria-hidden="true">
          <path d="M10 70 L10 38 L40 16 L70 38 L70 70 Z M78 70 L78 30 L100 16 L112 26 L112 70 Z" fill="currentColor" />
          <rect x="30" y="48" width="12" height="22" fill="currentColor" opacity="0.6" />
        </svg>
      </div>
    );
  }
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={cn("object-cover", className)} onError={() => setFailed(true)} />;
}
