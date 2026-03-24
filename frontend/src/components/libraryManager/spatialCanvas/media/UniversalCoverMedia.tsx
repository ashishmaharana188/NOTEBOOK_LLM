import React from "react";

const UniversalCoverMedia = ({ url }: { url: string }) => {
  if (!url) return null;
  const ext = url.split(".").pop()?.toLowerCase();

  if (["mp4", "webm", "mov"].includes(ext || "")) {
    return (
      <video
        src={url}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
    );
  }

  if (["mp3", "wav", "ogg"].includes(ext || "")) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
        <div className="w-16 h-16 rounded-full bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6)] mb-8" />
        <audio src={url} controls className="z-50 pointer-events-auto" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt="Cover Media"
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
    />
  );
};

export default UniversalCoverMedia;
