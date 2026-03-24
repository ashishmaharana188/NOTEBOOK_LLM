import React from "react";

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
  trackClassName?: string;
  progressClassName?: string;
  textClassName?: string;
}

export default function CircularProgress({
  value,
  size = 44,
  strokeWidth = 4,
  label,
  className = "",
  trackClassName = "stroke-slate-200",
  progressClassName = "stroke-slate-700",
  textClassName = "fill-slate-700",
}: CircularProgressProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          className={trackClassName}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={progressClassName}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className={`text-[8px] font-bold font-mono ${textClassName}`}
        >
          {label || `${clamped}%`}
        </text>
      </svg>
    </div>
  );
}
