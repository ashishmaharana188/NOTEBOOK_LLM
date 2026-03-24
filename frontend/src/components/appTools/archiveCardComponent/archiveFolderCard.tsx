import React, { useState, useMemo, useEffect } from "react";

interface ArchiveFolderCardProps {
  id: string; // Used to generate the deterministic solid color and randoms
  title?: string;
  count?: number;
  isEmpty?: boolean;
  isOuterStack?: boolean; // NEW: Triggers thicker borders for 3-level archives
  locationTag?: string; // NEW: Renders the origin footer for 2-level archives
  children?: React.ReactNode;
  onSingleClick?: () => void;
  onDoubleClick?: () => void;
  onUpdateTitle?: (newTitle: string) => void;
  onDelete?: () => void;
}

// Generates consistent solid cool colors (Ice Blues, Mints, Slates, Lavenders)
const generateCoolSolidColor = (id: string) => {
  const safeId = String(id || "default"); // ✨ THE FIX: Safeguard against undefined IDs!
  const hash = safeId
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = (hash % 80) + 160; // 160-240: Cool spectrum
  return `hsl(${hue}, 35%, 92%)`; // Low saturation, high lightness for a solid pastel look
};

// Generates bounded randoms so the stack looks slightly messy but controlled
const getDeterministicRandom = (id: string, index: number) => {
  const safeId = String(id || "default"); // ✨ THE FIX: Safeguard against undefined IDs!
  const hash = safeId
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seed = hash + index;

  // ✨ BONUS FIX: Actually use the seed to generate the pseudo-random bounded jitter!
  const pseudoRandom1 = Math.abs(Math.sin(seed));
  const pseudoRandom2 = Math.abs(Math.cos(seed));

  return {
    rotate: 7, // -5deg to +10deg
    offsetY: -30, // -5px to +15px
    offsetX: 30, // Base fan + random jitter
  };
};

function ArchiveFolderCard({
  id,
  title = "Archived Items",
  count = 0,
  isEmpty = true,
  isOuterStack = false,
  locationTag,
  children,
  onSingleClick,
  onDoubleClick,
  onUpdateTitle,
  onDelete,
}: ArchiveFolderCardProps) {
  // Adjusted mask for the slightly smaller 260x360 size
  const folderMask = `url("data:image/svg+xml,%3Csvg width='260' height='360' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 0h232a14 14 0 0 1 14 14v114c0 9-3 14-8 17l-4 3c-5 4-7 9-7 15v36c0 6 2 11 7 15l4 3c5 3 8 8 8 17v112a14 14 0 0 1-14 14H14A14 14 0 0 1 0 346V14A14 14 0 0 1 14 0z' fill='black'/%3E%3C/svg%3E")`;

  const folderColor = useMemo(() => generateCoolSolidColor(id), [id]);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);

  useEffect(() => {
    setEditTitle(title);
  }, [title]);

  const handleSave = () => {
    setIsEditing(false);
    if (
      editTitle.trim() !== "" &&
      editTitle.trim() !== title &&
      onUpdateTitle
    ) {
      onUpdateTitle(editTitle.trim());
    } else {
      setEditTitle(title);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setIsEditing(false);
      setEditTitle(title);
    }
  };

  return (
    <div
      data-archive-id={id}
      className="relative w-[260px] h-[360px] cursor-pointer group pointer-events-auto"
      onClick={(e) => {
        e.stopPropagation();
        if (onSingleClick) onSingleClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onDoubleClick) onDoubleClick();
      }}
      style={{ zIndex: 100 }}
    >
      {/* 1. BACK COVER */}
      <div
        className="absolute inset-0 bg-slate-300 rounded-2xl"
        style={{ zIndex: 0 }}
      />

      {/* 2. THE MESSY NESTED CARDS */}
      {!isEmpty && children && (
        <div
          className="absolute inset-0 p-4 pointer-events-none"
          style={{ zIndex: 10 }}
        >
          {React.Children.map(children, (child, index) => {
            const random = getDeterministicRandom(id, index);
            const safeIndex = isNaN(index) ? 0 : index; // ✨ THE FIX: Safety fallback for NaN z-index

            return (
              <div
                key={`archive-child-${safeIndex}`} // ✨ THE FIX: Added the missing unique key!
                className="absolute inset-0 transition-transform duration-500 pointer-events-auto"
                style={{
                  zIndex: 10 + safeIndex,
                  transform: `translate(${random.offsetX}px, ${random.offsetY}px) rotate(${random.rotate}deg)`,
                  transformOrigin: "bottom left",
                }}
              >
                <div className="w-full h-full scale-90  rounded-xl overflow-hidden bg-white/50 border border-slate-200">
                  {child}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. FRONT COVER (Solid Color + Thicker Borders for Outer Stacks) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 50,
          filter: "drop-shadow(4px 0px 8px rgba(0, 0, 0, 0.12))",
        }}
      >
        <div
          className={`w-full h-full flex flex-col relative overflow-hidden ${
            isOuterStack ? "border-[6px] border-slate-300/60 rounded-xl" : ""
          }`}
          style={{
            backgroundColor: folderColor,
            maskImage: folderMask,
            WebkitMaskImage: folderMask,
            maskSize: "100% 100%",
          }}
        >
          {/* Subtle Paper Texture Overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20 mix-blend-multiply"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="flex flex-col h-full opacity-90 p-6 pt-10">
            {/* INLINE EDITING UI */}
            <div className="flex items-start justify-between mb-3 pr-2 group/title">
              {isEditing ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleSave}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  className="text-xl font-serif font-black text-slate-800 leading-tight bg-white/60 border border-slate-400 rounded px-2 py-1 outline-none w-full shadow-inner pointer-events-auto"
                />
              ) : (
                <h3
                  className="text-2xl font-serif font-black text-slate-800 leading-tight pr-2 line-clamp-2"
                  title={title}
                >
                  {title}
                </h3>
              )}

              {!isEditing && (onUpdateTitle || onDelete) && (
                <div className="flex items-center gap-1 opacity-0 group-hover/title:opacity-100 transition-opacity pointer-events-auto">
                  {onDelete && isEmpty && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                      }}
                      className="p-1.5 hover:bg-red-100 rounded-md text-red-600 active:scale-95"
                      title="Delete Empty Archive"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                  {onUpdateTitle && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                      }}
                      className="p-1.5 hover:bg-white/50 rounded-md text-slate-600 active:scale-95"
                      title="Rename Archive"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>

            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 bg-white/40 border border-white/50 w-max px-2.5 py-1 rounded-full shadow-sm">
              {count} Items Stored
            </p>

            {/* Location Tag Footer for 2-Level Inner Archives */}
            {locationTag && (
              <div className="mt-auto pt-4 border-t border-slate-800/10">
                <span className="block text-[8px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
                  Origin Link
                </span>
                <span className="text-xs font-bold text-slate-700 truncate w-full block">
                  {locationTag}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(ArchiveFolderCard);
