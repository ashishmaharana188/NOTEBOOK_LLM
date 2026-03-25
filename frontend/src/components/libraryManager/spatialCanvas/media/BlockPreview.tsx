import React from "react";

type PreviewMode = "full" | "media" | "compact";

const stripHtml = (content: string) =>
  content
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const detectMediaKind = (content: string) => {
  const lowered = content.toLowerCase();
  if (
    lowered.includes("<video") ||
    lowered.includes("<iframe") ||
    lowered.includes("youtube.com") ||
    lowered.includes("youtu.be")
  ) {
    return "Media";
  }
  if (lowered.includes("<img")) {
    return "Image";
  }
  if (
    lowered.includes("<audio") ||
    lowered.includes(".mp3") ||
    lowered.includes(".wav")
  ) {
    return "Audio";
  }
  if (lowered.includes("<pre")) {
    return "Code";
  }
  return null;
};

// The preview stays cheap during motion and restores the full rich DOM at rest.
const BlockPreview = React.memo(
  ({
    htmlContent,
    textClass,
    isNote,
    title,
    previewMode = "full",
  }: {
    htmlContent: string;
    textClass: string;
    isNote: boolean;
    title: string;
    previewMode?: PreviewMode;
  }) => {
    const parsed = React.useMemo(() => {
      const plainText = stripHtml(htmlContent || "");
      const mediaKind = detectMediaKind(htmlContent || "");
      const imageMatch = (htmlContent || "").match(
        /<img[^>]+src=["']([^"']+)["']/i,
      );
      const imageSrc = imageMatch?.[1] || null;

      if (previewMode === "compact") {
        return {
          type: "compact",
          mediaKind,
          plainText,
        };
      }

      if (previewMode === "media") {
        return {
          type: mediaKind === "Image" && imageSrc ? "media" : "compact",
          mediaKind,
          plainText,
          imageSrc,
        };
      }

      if (!htmlContent) return { type: "empty", plainText };
      if (!htmlContent.includes("<")) {
        return { type: "plain", plainText: htmlContent };
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");

      const mediaNodes = Array.from(
        doc.querySelectorAll("img, video, iframe, audio, pre"),
      );
      const lastNode =
        mediaNodes.length > 0 ? mediaNodes[mediaNodes.length - 1] : null;

      const lastAudioIndex = Math.max(
        htmlContent.lastIndexOf(".mp3"),
        htmlContent.lastIndexOf(".wav"),
      );
      let lastNodeIndex = -1;
      if (lastNode) {
        const nodeStrSnippet = lastNode.outerHTML.substring(0, 15);
        lastNodeIndex = htmlContent.lastIndexOf(nodeStrSnippet);
      }

      const isRawAudio =
        lastAudioIndex > lastNodeIndex && lastAudioIndex !== -1;

      let tagName = null;
      let src = null;
      let outerHTML = null;

      if (lastNode) {
        tagName = lastNode.tagName.toLowerCase();
        src = (lastNode as any).src || null;
        outerHTML = lastNode.outerHTML;
      }

      let truncatedHTML = "";
      let textBlocks = 0;
      Array.from(doc.body.children).forEach((child) => {
        if (
          textBlocks < 3 &&
          !["img", "video", "audio", "iframe", "pre"].includes(
            child.tagName.toLowerCase(),
          )
        ) {
          truncatedHTML += child.outerHTML;
          textBlocks++;
        }
      });

      if (!truncatedHTML) {
        truncatedHTML = plainText
          ? `<p>${plainText.substring(0, 150)}...</p>`
          : "<p>No content available.</p>";
      }

      return {
        type: "html",
        isRawAudio,
        tagName,
        src,
        outerHTML,
        truncatedHTML,
        plainText,
      };
    }, [htmlContent, previewMode]);

    if (parsed.type === "compact") {
      const compactText =
        parsed.plainText.length > 240
          ? `${parsed.plainText.slice(0, 240)}...`
          : parsed.plainText;
      return (
        <div
          className={`absolute inset-0 p-5 flex flex-col items-center justify-center text-center overflow-hidden ${textClass} canvas-heavy-preview-compact`}
        >
          <div className="flex max-w-full flex-col items-center gap-3">
            {!isNote && title ? (
              <h3 className="font-bold tracking-tight leading-snug text-base text-slate-900 line-clamp-2 max-w-full">
                {title}
              </h3>
            ) : (
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Preview
              </span>
            )}
            {parsed.mediaKind && (
              <span className="shrink-0 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
                {parsed.mediaKind}
              </span>
            )}
          </div>
          <p className="mt-4 max-w-full text-xs leading-6 opacity-80 line-clamp-6">
            {compactText || "No content available."}
          </p>
        </div>
      );
    }

    if (parsed.type === "media") {
      return (
        <div className="absolute inset-0 z-10 overflow-hidden canvas-heavy-media">
          <img
            src={parsed.imageSrc || undefined}
            alt="Preview"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-5 text-center">
            {!isNote && title && (
              <h3 className="text-sm font-bold tracking-tight text-white line-clamp-2">
                {title}
              </h3>
            )}
          </div>
        </div>
      );
    }

    if (parsed.type === "empty") {
      return (
        <div
          className={`absolute inset-0 p-8 leading-relaxed font-sans text-sm ${textClass} overflow-hidden`}
        >
          No content available.
        </div>
      );
    }

    if (parsed.type === "plain") {
      return (
        <div
          className={`absolute inset-0 p-8 flex flex-col overflow-hidden ${textClass}`}
        >
          {!isNote && title && (
            <h3 className="font-bold tracking-tight leading-snug shrink-0 text-lg mb-3 text-slate-900">
              {title}
            </h3>
          )}
          <p className="leading-relaxed font-sans text-sm">{parsed.plainText}</p>
        </div>
      );
    }

    if (parsed.isRawAudio || parsed.tagName === "audio") {
      return (
        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center z-10">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
            <span className="text-white font-black tracking-[0.2em] text-3xl uppercase">
              .REC
            </span>
          </div>
        </div>
      );
    }

    if (parsed.tagName === "video" || parsed.tagName === "iframe") {
      return (
        <div className="absolute inset-0 bg-black z-10 overflow-hidden canvas-heavy-media">
          {parsed.tagName === "video" ? (
            <video
              src={parsed.src}
              className="w-full h-full object-cover opacity-90 pointer-events-none"
              muted
              loop
              playsInline
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <span className="text-white/30 font-bold tracking-[0.2em] text-2xl uppercase">
                .VIDEO
              </span>
            </div>
          )}
        </div>
      );
    }

    if (parsed.tagName === "img") {
      return (
        <div className="absolute inset-0 z-10 bg-slate-100 overflow-hidden canvas-heavy-media">
          <img
            src={parsed.src}
            alt="Preview"
            className="w-full h-full object-cover"
          />
        </div>
      );
    }

    if (parsed.tagName === "pre") {
      return (
        <div className="absolute inset-0 bg-[#0d1117] text-slate-100 p-8 z-10 overflow-hidden flex flex-col canvas-heavy-media">
          <div className="absolute top-4 right-5 text-[10px] font-bold tracking-widest text-slate-500 uppercase z-20">
            Code
          </div>
          <div
            className="flex-1 w-full h-full overflow-hidden text-[11px] font-mono leading-relaxed [&>pre]:!m-0 [&>pre]:!bg-transparent [&>pre]:!p-0"
            dangerouslySetInnerHTML={{ __html: parsed.outerHTML || "" }}
          />
        </div>
      );
    }

    return (
      <div
        className={`absolute inset-0 p-8 flex flex-col overflow-hidden ${textClass}`}
      >
        {!isNote && title && (
          <h3 className="font-bold tracking-tight leading-snug shrink-0 text-xl mb-3 text-slate-900 border-b border-slate-200/50 pb-3">
            {title}
          </h3>
        )}
        <div
          className="flex-1 overflow-hidden prose prose-sm prose-slate prose-headings:font-bold prose-p:leading-relaxed prose-a:text-blue-600 max-w-none mask-image-b canvas-heavy-preview-rich"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, black 70%, transparent 100%)",
          }}
          dangerouslySetInnerHTML={{ __html: parsed.truncatedHTML || "" }}
        />
      </div>
    );
  },
);

export default BlockPreview;
