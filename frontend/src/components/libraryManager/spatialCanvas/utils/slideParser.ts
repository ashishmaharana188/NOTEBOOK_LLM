export const parseToSlides = (htmlString: string) => {
  if (!htmlString) return [];
  if (!htmlString.includes("<")) return [{ type: "text", content: htmlString }];

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  const slides: any[] = [];

  let currentTextGroup: string[] = [];
  let textSlideCount = 0;
  const MAX_TEXT_SLIDES = 3; // Hard limit to prevent A3 memory bloat

  const pushTextGroup = () => {
    if (currentTextGroup.length > 0) {
      if (textSlideCount < MAX_TEXT_SLIDES) {
        const truncatedGroup = currentTextGroup.slice(0, 3);

        // If this is the absolute final allowed text slide, append a UI button to open the reader
        if (textSlideCount === MAX_TEXT_SLIDES - 1) {
          truncatedGroup.push(`
             <div class="mt-8 pt-8 border-t border-slate-200/50 flex flex-col items-center justify-center">
               <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Document Truncated</span>
               <button class="bg-blue-50 text-blue-600 border border-blue-200 px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm">
                 Open Reader for Full Note
               </button>
             </div>
           `);
        }

        slides.push({ type: "text", html: truncatedGroup.join("") });
        textSlideCount++;
      }
      currentTextGroup = [];
    }
  };

  Array.from(doc.body.children).forEach((child) => {
    const tagName = child.tagName.toLowerCase();
    const img = tagName === "img" ? child : child.querySelector("img");
    const video =
      tagName === "video" || tagName === "iframe"
        ? child
        : child.querySelector("video") || child.querySelector("iframe");
    const audio = tagName === "audio" ? child : child.querySelector("audio");
    const pre = tagName === "pre" ? child : child.querySelector("pre");
    const hasRawAudio =
      child.innerHTML.includes(".mp3") || child.innerHTML.includes(".wav");

    // Media ignores the hard limit so you can always see all images/videos
    if (img && (img as HTMLImageElement).src) {
      pushTextGroup();
      slides.push({ type: "image", src: (img as HTMLImageElement).src });
    } else if (video && (video as any).src) {
      pushTextGroup();
      slides.push({
        type: "video",
        src: (video as any).src,
        isVideo: video.tagName.toLowerCase() === "video",
      });
    } else if (audio && (audio as any).src) {
      pushTextGroup();
      slides.push({ type: "audio", src: (audio as any).src });
    } else if (hasRawAudio) {
      pushTextGroup();
      const match = child.innerHTML.match(/https?:\/\/[^\s"'<>]+?\.(mp3|wav)/i);
      slides.push({ type: "audio", src: match ? match[0] : "" });
    } else if (pre) {
      pushTextGroup();
      slides.push({ type: "code", html: pre.outerHTML });
    } else if (child.textContent?.trim()) {
      currentTextGroup.push(child.outerHTML);
    }
  });

  pushTextGroup();

  return slides.length > 0 ? slides : [{ type: "text", html: htmlString }];
};
