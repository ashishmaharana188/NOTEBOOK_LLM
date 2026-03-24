import React from "react";

// THE FIX: Wrapped in React.memo so the browser doesn't re-paint the text during drags
const BlockPreview = React.memo(
  ({
    htmlContent,
    textClass,
    isNote,
    title,
  }: {
    htmlContent: string;
    textClass: string;
    isNote: boolean;
    title: string;
  }) => {
    // THE FIX: The Heavy DOMParser runs EXACTLY ONCE per card, and caches the result!
    const parsed = React.useMemo(() => {
      if (!htmlContent) return { type: "empty" };
      if (!htmlContent.includes("<")) return { type: "plain" };

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

      if (!truncatedHTML)
        truncatedHTML = `<p>${htmlContent.substring(0, 150)}...</p>`;

      return {
        type: "html",
        isRawAudio,
        tagName,
        src,
        outerHTML,
        truncatedHTML,
      };
    }, [htmlContent]);

    // --- RENDERING BASED ON THE CACHED PARSER ---
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
          <p className="leading-relaxed font-sans text-sm">{htmlContent}</p>
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
        <div className="absolute inset-0 bg-black z-10 overflow-hidden">
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
        <div className="absolute inset-0 z-10 bg-slate-100 overflow-hidden">
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
        <div className="absolute inset-0 bg-[#0d1117] text-slate-100 p-8 z-10 overflow-hidden flex flex-col">
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
          className="flex-1 overflow-hidden prose prose-sm prose-slate prose-headings:font-bold prose-p:leading-relaxed prose-a:text-blue-600 max-w-none mask-image-b"
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
