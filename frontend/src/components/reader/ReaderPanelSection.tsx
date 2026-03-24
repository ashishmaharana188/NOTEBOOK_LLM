import React, { useState } from "react";
import { IconChevronDown } from "./readerIcons";

interface ReaderPanelSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function ReaderPanelSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: ReaderPanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-xl border border-black/10 bg-canvas">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          {icon ? <span className="text-primary">{icon}</span> : null}
          <span>{title}</span>
        </div>
        <span
          className={`text-primary transition-transform ${open ? "rotate-180" : "rotate-0"}`}
        >
          <IconChevronDown />
        </span>
      </button>
      {open ? <div className="border-t border-black/10 p-4">{children}</div> : null}
    </section>
  );
}
