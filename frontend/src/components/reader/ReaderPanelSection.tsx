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
    <section className="mt-4 border-t border-black/10 pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 py-1 text-left"
      >
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
          {icon ? <span className="text-primary">{icon}</span> : null}
          <span>{title}</span>
        </div>
        <span
          className={`text-primary transition-transform ${open ? "rotate-180" : "rotate-0"}`}
        >
          <IconChevronDown />
        </span>
      </button>
      {open ? <div className="space-y-3 pb-2 pt-3">{children}</div> : null}
    </section>
  );
}
