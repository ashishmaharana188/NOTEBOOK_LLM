export const PATTERN_A = [
  // --- ORBIT 1 (Inner 8) ---
  { x: -490, y: -70 }, // 0. Side: Top Left
  { x: -560, y: 370 }, // 1. Side: Mid Left
  { x: -500, y: 800 }, // 2. Corner: Bottom Left
  { x: -130, y: 960 }, // 3. Bottom: Center
  { x: 220, y: 1050 }, // 4. Bottom: Far Right
  { x: -130, y: -290 }, // 5. Overlap: Top Left

  // --- ORBIT 2 (Outer 8) ---
  { x: -820, y: -250 }, // 8. Outer Side: Top Left (Pushed Left & Up)
  { x: -890, y: 180 }, // 9. Outer Side: Mid Left (Pushed Left)
  { x: -940, y: 750 }, // 10. Outer Corner: Bottom Left (Pushed Left & Down)
  { x: -500, y: 1250 }, // 11. Outer Bottom: Center (Pushed Down)
  { x: -100, y: 1420 }, // 12. Outer Bottom: Far Right (Pushed Right & Down)
  { x: -480, y: -500 }, // 13. Outer Overlap: Top Left
];

// PATTERN B: Right L-Shape (Perfectly inverted X values)
export const PATTERN_B = [
  // --- ORBIT 1 (Inner 6) ---
  { x: 490, y: -70 }, // 0. Side: Top Right
  { x: 560, y: 370 }, // 1. Side: Mid Right
  { x: 500, y: 800 }, // 2. Corner: Bottom Right
  { x: 130, y: 960 }, // 3. Bottom: Center
  { x: -220, y: 1050 }, // 4. Bottom: Far Left
  { x: 130, y: -290 }, // 5. Overlap: Top Right

  // --- ORBIT 2 (Outer 6) ---
  { x: 820, y: -250 }, // 6. Outer Side: Top Right (Pushed Right & Up)
  { x: 890, y: 180 }, // 7. Outer Side: Mid Right (Pushed Right)
  { x: 940, y: 750 }, // 8. Outer Corner: Bottom Right (Pushed Right & Down)
  { x: 500, y: 1250 }, // 9. Outer Bottom: Center (Pushed Down)
  { x: 100, y: 1420 }, // 10. Outer Bottom: Far Left (Pushed Left & Down)
  { x: 480, y: -500 }, // 11. Outer Overlap: Top Right
];

export const QUICK_THOUGHT_PATTERN = [
  { x: -200, y: -690 },
  { x: -120, y: -600 },
  { x: 60, y: -550 },
  { x: 180, y: -640 },
  { x: 140, y: -660 },
  { x: -160, y: -680 },
  { x: 150, y: -280 },
];

export const getCardRole = (
  index: number,
  chunk: any,
  canvasMode: "ECHO" | "NOTES",
) => {
  if (chunk?.is_quick_thought) return "QUICK_THOUGHT"; // Free-floating A6/A7 thoughts

  if (canvasMode === "ECHO") {
    if (chunk?.type === "note" || chunk?.relation === "User Note")
      return "A5_NOTE";
    return "A4_ECHO";
  } else {
    if (chunk?.type === "echo" || chunk?.relation === "AI Echo")
      return "A5_ECHO";
    return "A4_NOTE";
  }
};
