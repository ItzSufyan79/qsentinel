import { animate } from "animejs";
import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from its previous value to `target` using anime.js, so
 * stat readouts count up instead of snapping to their final value.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    const from = current.current;
    const state = { v: from };
    const anim = animate(state, {
      v: target,
      duration,
      ease: "outExpo",
      onUpdate: () => {
        setValue(state.v);
        current.current = state.v;
      },
    });
    return () => {
      anim.cancel();
    };
  }, [target, duration]);

  return value;
}
