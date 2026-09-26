"use client";

import { useEffect, useRef } from "react";

export function OpenDetailsOnMount() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const details = ref.current?.closest("details");
    if (details) details.open = true;
  }, []);
  return <span ref={ref} hidden />;
}
