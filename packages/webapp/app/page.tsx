"use client";

import dynamic from "next/dynamic";

const Assistant = dynamic(() => import("./assistant").then(m => ({ default: m.Assistant })), {
  ssr: false,
});

export default function Home() {
  return (
    <div className="h-screen overflow-hidden">
      <Assistant />
    </div>
  );
}
