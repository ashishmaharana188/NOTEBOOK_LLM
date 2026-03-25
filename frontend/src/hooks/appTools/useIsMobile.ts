import { useEffect, useState } from "react";

const MOBILE_QUERY = "(max-width: 767px)";

const getIsMobile = () => {
    if (typeof window === "undefined" || !window.matchMedia) {
        return false;
    }
    return window.matchMedia(MOBILE_QUERY).matches;
};

export default function useIsMobile() {
    const [isMobile, setIsMobile] = useState(getIsMobile);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) {
            return undefined;
        }

        const mediaQuery = window.matchMedia(MOBILE_QUERY);
        const handleChange = () => setIsMobile(mediaQuery.matches);

        handleChange();

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", handleChange);
            return () => mediaQuery.removeEventListener("change", handleChange);
        }

        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }, []);

    return isMobile;
}
