"use client";

import { useEffect, useState } from "react";

const WORDS = ["landing page", "portfolio", "promo site", "HTML page"];

export default function WordCycle() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // fade out, swap word, fade in
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % WORDS.length);
        setVisible(true);
      }, 300);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      className="text-zinc-900 font-semibold transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {WORDS[index]}
    </span>
  );
}
