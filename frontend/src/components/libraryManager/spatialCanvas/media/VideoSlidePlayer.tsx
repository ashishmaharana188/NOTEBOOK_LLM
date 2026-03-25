import React, { useState, useRef } from "react";
import { PlayIcon } from "@heroicons/react/24/outline";

const VideoSlidePlayer = ({
  src,
  isVideo,
}: {
  src: string;
  isVideo: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Framer Motion smartly cancels the onClick event if the user was dragging!
  const handleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  if (!isVideo) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900 rounded-[inherit]">
        <span className="text-white/30 font-bold tracking-[0.2em] text-2xl uppercase">
          .VIDEO
        </span>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-black rounded-[inherit] overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        playsInline
        onEnded={() => setIsPlaying(false)}
      />
      {/* Interactive Overlay: catches taps for play/pause, but passes drags to Framer Motion */}
      <div
        className="absolute inset-0 z-10 cursor-pointer flex items-center justify-center pointer-events-auto"
        onClick={handleTap}
      >
        {!isPlaying && (
          <div className="w-16 h-16 bg-black/40  -sm rounded-full flex items-center justify-center text-white border border-white/20 shadow-xl transition-transform hover:scale-110">
            <PlayIcon className="w-8 h-8 ml-1" />
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoSlidePlayer;
