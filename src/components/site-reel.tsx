"use client";

import { useEffect, useRef } from "react";

/**
 * Phone-shaped 9:16 frame with the Ordavo reel. Autoplays muted and loops;
 * a tap reveals the native controls (so sound can be switched on).
 * With prefers-reduced-motion the video does not autoplay and controls are shown.
 */
export function SiteReel({ label, hint }: { label: string; hint: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.pause();
      v.controls = true;
    }
  }, []);

  return (
    <figure className="mx-auto w-full max-w-[280px] sm:max-w-[340px] lg:max-w-[min(460px,calc((100svh_-_150px)*0.5625))]">
      <div className="rounded-[2.4rem] border border-gold/30 bg-black p-2 shadow-[0_0_60px_rgba(201,164,92,0.18)]">
        <video
          ref={ref}
          className="aspect-[9/16] w-full rounded-[1.9rem] bg-black object-cover"
          src="/reel/ordavo-reel.mp4"
          poster="/reel/poster.jpg"
          aria-label={label}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onClick={(e) => {
            e.currentTarget.controls = true;
          }}
        />
      </div>
      <figcaption className="mt-3 text-center text-xs text-fog">{hint}</figcaption>
    </figure>
  );
}
