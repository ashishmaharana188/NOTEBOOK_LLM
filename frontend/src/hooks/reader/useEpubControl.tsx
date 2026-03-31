import { useRef, useEffect, useMemo, useState } from "react";
import { useReaderSetting } from "./useReaderSetting";
import type { ReaderLocationPayload } from "../../types/readerBackendTypes";

export function useEpubControl(
  initialLocation: string | number | null,
  onSaveLocation: (payload: ReaderLocationPayload) => void,
  onSelection?: (text: string) => void,
  onActivity?: () => void,
) {
  const { settings, updateSetting, themeStyles } = useReaderSetting();

  const renditionRef = useRef<any>(null);
  const currentLocation = useRef(initialLocation);
  const [toc, setToc] = useState<any[]>([]);

  const navigateTo = (href: string) => {
    renditionRef.current?.display(href);
  };

  const prevPage = () => renditionRef.current?.prev();
  const nextPage = () => renditionRef.current?.next();

  const handleLocationChanged = (loc: string | number) => {
    currentLocation.current = loc;
    onSaveLocation({
      location: loc,
      locationType: "epub_cfi",
      viewState: {
        flow: settings.flow,
        spread: settings.spread,
      },
    });
  };

  const handleTocChange = (tocData: any) => {
    setToc(tocData);
  };

  useEffect(() => {
    return () => {
      if (currentLocation.current) {
        onSaveLocation({
          location: currentLocation.current,
          locationType: "epub_cfi",
          viewState: {
            flow: settings.flow,
            spread: settings.spread,
          },
        });
      }
    };
  }, [onSaveLocation, settings.flow, settings.spread]);

  const getThemeCss = () => {
    if (
      !themeStyles ||
      !settings.theme ||
      !themeStyles[settings.theme as keyof typeof themeStyles]
    ) {
      return "";
    }

    const style = themeStyles[settings.theme as keyof typeof themeStyles];
    const horizontalInset = Math.max(4, Math.min(settings.pageMargin, 18));
    const isPaginated = settings.flow === "paginated";
    const pageGap = isPaginated ? "28px" : "0px";
    const scrolledInset = `${horizontalInset}%`;

    return `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background-color: ${style.body.background} !important;
        overflow: ${isPaginated ? "hidden" : "visible"} !important;
      }
      body, p, span, div, h1, h2, h3, h4, h5, h6, a, li, blockquote {
        color: ${style.body.color} !important;
        background-color: transparent !important;
        line-height: ${settings.lineHeight} !important;
        font-family: ${settings.fontFamily} !important;
        text-align: justify !important;
      }
      body {
        line-height: ${settings.lineHeight} !important;
        font-family: ${settings.fontFamily} !important;
        box-sizing: border-box !important;
        text-align: justify !important;
        column-gap: ${pageGap} !important;
        padding: ${isPaginated ? "0" : `32px ${scrolledInset} 12vh ${scrolledInset}`} !important;
        column-fill: auto !important;
        -webkit-hyphens: auto !important;
        hyphens: auto !important;
      }
      body > * {
        box-sizing: border-box !important;
        width: auto !important;
        max-width: ${
          isPaginated
            ? "none"
            : `min(72ch, calc(100% - ${horizontalInset * 2}%))`
        } !important;
        margin-left: ${isPaginated ? "0" : "auto"} !important;
        margin-right: ${isPaginated ? "0" : "auto"} !important;
      }
      img, svg, video, canvas, table, pre, code {
        max-width: 100% !important;
      }
      ::selection {
        background: ${style["::selection"].background} !important;
      }
    `;
  };

  const injectStyle = (contents: any) => {
    const doc = contents.document;
    if (!doc) return;

    let styleTag = doc.getElementById("reader-theme-style");
    if (!styleTag) {
      styleTag = doc.createElement("style");
      styleTag.id = "reader-theme-style";
      doc.head.appendChild(styleTag);
    }
    styleTag.innerHTML = getThemeCss();
  };

  const attachActivityListeners = (contents: any) => {
    const doc = contents?.document;
    if (!doc || !onActivity) return;

    const activityHandler = () => onActivity();
    doc.addEventListener("mousemove", activityHandler);
    doc.addEventListener("mousedown", activityHandler);
    doc.addEventListener("touchstart", activityHandler, { passive: true });
    doc.addEventListener("keydown", activityHandler);
  };

  const getRendition = (rendition: any) => {
    renditionRef.current = rendition;

    rendition.themes.fontSize(`${settings.fontSize}%`);
    if (settings.fontFamily) {
      rendition.themes.font(settings.fontFamily);
    }

    if (rendition.getContents) {
      rendition.getContents().forEach((content: any) => {
        injectStyle(content);
        attachActivityListeners(content);
      });
    }

    rendition.hooks.content.register((content: any) => {
      injectStyle(content);
      attachActivityListeners(content);
    });

    rendition.on("selected", (cfiRange: string) => {
      const range = rendition.getRange(cfiRange);
      const text = range ? range.toString() : "";

      if (text && text.trim().split(/\s+/).length > 2) {
        if (onSelection) onSelection(text);
      }
    });
  };

  useEffect(() => {
    if (!renditionRef.current) return;

    renditionRef.current.themes.fontSize(`${settings.fontSize}%`);
    if (settings.fontFamily) {
      renditionRef.current.themes.font(settings.fontFamily);
    }

    if (renditionRef.current.getContents) {
      renditionRef.current.getContents().forEach((content: any) => {
        injectStyle(content);
      });
    }
  }, [settings]);

  const epubOptions = useMemo(
    () =>
      ({
        openAs: "epub",
        flow: settings.flow,
        manager: settings.flow === "scrolled" ? "continuous" : "default",
        width: "100%",
        height: "100%",
        spread: settings.spread === "always" ? "always" : settings.spread,
        minSpreadWidth: settings.spread === "always" ? 0 : 800,
      } as any),
    [settings.flow, settings.spread],
  );

  const getContainerBg = () => {
    if (settings.theme === "dark") return "#050505";
    if (settings.theme === "sepia") return "#f9f6ef";
    return "#ffffff";
  };

  return {
    settings,
    updateSetting,
    toc,
    navigateTo,
    prevPage,
    nextPage,
    handleTocChange,
    handleLocationChanged,
    getRendition,
    epubOptions,
    getContainerBg,
  };
}
