import React from "react";

interface BinderCoverPreviewProps {
  title: string;
  coverMedia?: string;
  orientation?: "portrait" | "landscape";
  hideTitleOverlay?: boolean; // NEW: Toggle to hide the footer
}

function BinderCoverPreview({
  title,
  coverMedia,
  orientation = "portrait",
  hideTitleOverlay = false,
}: BinderCoverPreviewProps) {
  const isLandscape = orientation === "landscape";

  return (
    <div
      className={`relative rounded-xl overflow-hidden shadow-sm border border-slate-200/60 bg-white
        ${isLandscape ? "w-full h-3/4 mt-auto" : "w-full h-full"}
      `}
    >
      {/* Cover Image or Fallback Gradient */}
      {coverMedia ? (
        <img
          src={coverMedia}
          alt="cover"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200" />
      )}

      {/* Binder Title Overlay */}
      {!hideTitleOverlay && (
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
          <h4 className="text-[10px] font-bold text-white leading-tight line-clamp-2">
            {title}
          </h4>
        </div>
      )}
    </div>
  );
}

export default React.memo(BinderCoverPreview);
