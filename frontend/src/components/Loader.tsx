"use client";

import { motion } from "framer-motion";

export default function Loader({
  size = "md",
  className = "",
}: {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "h-4 w-4",
    sm: "h-6 w-6",
    md: "h-10 w-10",
    lg: "h-16 w-16",
  };

  return (
    <div
      className={`flex flex-col items-center justify-center ${sizes[size]} ${className}`}
    >
      <motion.svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-rose-500 w-full h-full drop-shadow-sm"
        animate={{
          y: [0, -2, 0],
          x: [0, 1, 0],
        }}
        transition={{
          duration: 0.4,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        {/* Head */}
        <circle cx="12" cy="4" r="2" />

        {/* Body leaned slightly forward */}
        <path d="M12 6l1 5" />

        {/* Left Leg (translate instead of path-morph) */}
        <motion.path
          d="M13 11l-3 4"
          animate={{ y: [0, 2, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Right Leg (translate instead of path-morph) */}
        <motion.path
          d="M13 11l2 4"
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Left Arm (translate/rotate instead of path-morph) */}
        <motion.path
          d="M12.5 7l-3 1"
          animate={{ y: [0, 1, 0], rotate: [0, -8, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Right Arm (translate/rotate instead of path-morph) */}
        <motion.path
          d="M12.5 7l2 3"
          animate={{ y: [0, -1, 0], rotate: [0, 8, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Dust trail 1 */}
        <motion.circle
          cx="8"
          cy="15"
          r="1"
          stroke="none"
          fill="currentColor"
          animate={{ x: [0, -6], opacity: [0.8, 0], scale: [1, 0.5] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "easeOut" }}
        />
        {/* Dust trail 2 */}
        <motion.circle
          cx="10"
          cy="14"
          r="0.8"
          stroke="none"
          fill="currentColor"
          animate={{ x: [0, -8], opacity: [0.6, 0], scale: [1, 0.5] }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            delay: 0.25,
            ease: "easeOut",
          }}
        />
      </motion.svg>
    </div>
  );
}
