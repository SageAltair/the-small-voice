import { useLayoutEffect } from "react";
import { gsap } from "gsap";

export default function useReveal(root) {
  useLayoutEffect(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const context = gsap.context(() => {
      gsap.from("[data-reveal]", { autoAlpha: 0, duration: 0.72, ease: "power2.out", stagger: 0.1, y: 18 });
    }, root);
    return () => context.revert();
  }, [root]);
}
