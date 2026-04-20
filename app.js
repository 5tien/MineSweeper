const ROWS = 14;
const COLS = 9;
const MIN_MINES = 16;
const MAX_MINES = 28;
const DESIGN_WIDTH = 375;
const MAX_SCALE = 1.16;

const boardEl = document.querySelector("#board");
const mineCountEl = document.querySelector("#mineCount");
const currentStreakEl = document.querySelector("#currentStreak");
const allTimeEl = document.querySelector("#allTime");
const digModeButton = document.querySelector("#digMode");
const flagModeButton = document.querySelector("#flagMode");
const modeSwitchEl = document.querySelector(".mode-switch");
const resetButton = document.querySelector(".reset-button");
const hintButton = document.querySelector(".hint-button");
const minePillEl = document.querySelector(".mine-pill");

const storageKey = "minesweeper-scores-v2";
const savedScores = readSavedScores();
let scores = savedScores || { current: 0, best: 0 };
let mineTotal = chooseMineTotal();
let mode = "flag";
let mines = new Set();
let revealed = new Set();
let flags = new Set();
let gameOver = false;
let hasFirstMove = false;
let suppressNextClick = false;
let revealAnimationCells = new Set();
let revealAnimationOrigin = null;
let revealAnimationTimer = 0;
let boardDropTimer = 0;
let boardShakeTimer = 0;
let boardWinTimer = 0;
let flagAnimationCells = new Set();
let unflagAnimationCells = new Set();
let flagAnimationTimer = 0;
let suppressClickTimer = 0;

function setAppScale() {
  const viewport = window.visualViewport;
  const viewportWidth = viewport ? viewport.width : window.innerWidth;
  const scale = Math.min(viewportWidth / DESIGN_WIDTH, MAX_SCALE);
  document.documentElement.style.setProperty("--app-scale", Math.max(0.1, scale).toFixed(4));
}

function lockPageZoom() {
  const prevent = (event) => event.preventDefault();

  document.addEventListener("gesturestart", prevent, { passive: false });
  document.addEventListener("gesturechange", prevent, { passive: false });
  document.addEventListener("gestureend", prevent, { passive: false });
  document.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) event.preventDefault();
  }, { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener("touchend", (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  window.addEventListener("wheel", (event) => {
    if (event.ctrlKey) event.preventDefault();
  }, { passive: false });

  window.addEventListener("keydown", (event) => {
    const zoomKeys = ["+", "=", "-", "0"];
    if ((event.ctrlKey || event.metaKey) && zoomKeys.includes(event.key)) {
      event.preventDefault();
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

function readSavedScores() {
  try {
    const value = localStorage.getItem(storageKey);
    if (!value) return null;

    const parsed = JSON.parse(value);
    const current = Number.isFinite(parsed.current) ? parsed.current : 0;
    const best = Number.isFinite(parsed.best) ? parsed.best : 0;

    return {
      current: Math.max(0, Math.floor(current)),
      best: Math.max(0, Math.floor(best)),
    };
  } catch {
    return null;
  }
}

function key(row, col) {
  return `${row},${col}`;
}

function neighbors(row, col) {
  const cells = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (nextRow >= 0 && nextRow < ROWS && nextCol >= 0 && nextCol < COLS) {
        cells.push([nextRow, nextCol]);
      }
    }
  }
  return cells;
}

function countAdjacentMines(row, col) {
  return neighbors(row, col).filter(([nextRow, nextCol]) => mines.has(key(nextRow, nextCol))).length;
}

function makeFlagSvg() {
  return `
    <svg viewBox="0 0 34 34" aria-hidden="true">
      <path d="M22 5.5v23" fill="none" stroke="#333b43" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M20.7 8.6 7.2 15.5l13.5 6.6z" fill="#f65d57"/>
    </svg>
  `;
}

function makeMineSvg() {
  return `
    <svg viewBox="0 0 34 34" aria-hidden="true">
      <path d="M17 6.7v-4M17 31.3v-4M6.7 17h-4M31.3 17h-4M10 10 7.1 7.1M26.9 26.9 24 24M24 10l2.9-2.9M7.1 26.9 10 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <circle cx="17" cy="17" r="8.8" fill="currentColor"/>
      <circle cx="21" cy="12.5" r="2.2" fill="#f7f7f8"/>
    </svg>
  `;
}

function renderScores() {
  currentStreakEl.textContent = scores.current;
  allTimeEl.textContent = scores.best;
  try {
    localStorage.setItem(storageKey, JSON.stringify(scores));
  } catch {
    // Private browsing modes can make localStorage unavailable.
  }
}

function renderMode() {
  digModeButton.classList.toggle("selected", mode === "dig");
  flagModeButton.classList.toggle("selected", mode === "flag");
}

function replayElementAnimation(element, className, duration = 520) {
  if (!element) return;

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => {
    element.classList.remove(className);
  }, duration);
}

function suppressSyntheticClick() {
  window.clearTimeout(suppressClickTimer);
  suppressNextClick = true;
  suppressClickTimer = window.setTimeout(() => {
    suppressNextClick = false;
  }, 700);
}

function renderBoard() {
  const cells = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const id = key(row, col);
      const isRevealed = revealed.has(id);
      const isFlagged = flags.has(id);
      const isMine = mines.has(id);
      const count = countAdjacentMines(row, col);
      let className = "cell";
      let label = `Cell ${row + 1}, ${col + 1}`;
      let content = "";
      let dataCount = "";
      const revealDelay = revealAnimationOrigin
        ? (Math.abs(row - revealAnimationOrigin[0]) + Math.abs(col - revealAnimationOrigin[1])) * 22
        : 0;

      if (isRevealed) {
        className += " revealed";
        if (revealAnimationCells.has(id) && !isMine) className += " revealed-new";
        if (isMine) {
          className += " mine";
          content = makeMineSvg();
          label += ", mine";
        } else if (count > 0) {
          dataCount = ` data-count="${count}"`;
          content = String(count);
          label += `, ${count}`;
        } else {
          dataCount = ' data-count="0"';
          label += ", empty";
        }
      } else if (isFlagged) {
        className += " flagged";
        if (flagAnimationCells.has(id)) className += " flag-new";
        content = makeFlagSvg();
        label += ", flagged";
      } else if (gameOver && isMine) {
        className += " mine mine-reveal hidden";
        content = makeMineSvg();
        label += ", mine";
      } else {
        className += " hidden";
        if (unflagAnimationCells.has(id)) className += " flag-removed";
      }

      cells.push(`
        <button
          class="${className}"
          type="button"
          data-row="${row}"
          data-col="${col}"
          style="--drop-delay: ${row * 18 + col * 5}ms; --reveal-delay: ${revealDelay}ms; --mine-delay: ${(row + col) * 18}ms"
          ${dataCount}
          aria-label="${label}"
        >${content}</button>
      `);
    }
  }

  boardEl.innerHTML = cells.join("");
  mineCountEl.textContent = Math.max(0, mineTotal - flags.size);
}

function triggerBoardDrop() {
  window.clearTimeout(boardDropTimer);
  boardEl.classList.remove("board-drop");
  void boardEl.offsetWidth;
  boardEl.classList.add("board-drop");
  boardDropTimer = window.setTimeout(() => {
    boardEl.classList.remove("board-drop");
  }, 950);
}

function triggerBoardShake() {
  window.clearTimeout(boardShakeTimer);
  boardEl.classList.remove("board-shake");
  void boardEl.offsetWidth;
  boardEl.classList.add("board-shake");
  boardShakeTimer = window.setTimeout(() => {
    boardEl.classList.remove("board-shake");
  }, 520);
}

function triggerWinAnimation() {
  window.clearTimeout(boardWinTimer);
  boardEl.classList.remove("board-win");
  void boardEl.offsetWidth;
  boardEl.classList.add("board-win");
  replayElementAnimation(currentStreakEl.parentElement, "counter-pop", 620);
  replayElementAnimation(allTimeEl.parentElement, "counter-pop", 620);
  boardWinTimer = window.setTimeout(() => {
    boardEl.classList.remove("board-win");
  }, 1200);
}

function markRevealAnimation(previousRevealed, originRow, originCol) {
  window.clearTimeout(revealAnimationTimer);
  revealAnimationCells = new Set(
    [...revealed].filter((id) => !previousRevealed.has(id))
  );
  revealAnimationOrigin = [originRow, originCol];
  revealAnimationTimer = window.setTimeout(() => {
    revealAnimationCells = new Set();
    revealAnimationOrigin = null;
  }, 850);
}

function markFlagAnimation(id, isFlagging) {
  window.clearTimeout(flagAnimationTimer);
  flagAnimationCells = isFlagging ? new Set([id]) : new Set();
  unflagAnimationCells = isFlagging ? new Set() : new Set([id]);
  flagAnimationTimer = window.setTimeout(() => {
    flagAnimationCells = new Set();
    unflagAnimationCells = new Set();
  }, 520);
}

function revealGroup(startRow, startCol) {
  const stack = [[startRow, startCol]];

  while (stack.length) {
    const [row, col] = stack.pop();
    const id = key(row, col);
    if (revealed.has(id) || flags.has(id)) continue;

    revealed.add(id);

    if (countAdjacentMines(row, col) === 0) {
      for (const next of neighbors(row, col)) {
        const nextId = key(next[0], next[1]);
        if (!revealed.has(nextId) && !mines.has(nextId)) {
          stack.push(next);
        }
      }
    }
  }
}

function revealCell(row, col) {
  if (gameOver) return;
  const id = key(row, col);
  if (flags.has(id) || revealed.has(id)) return;
  const previousRevealed = new Set(revealed);

  if (!hasFirstMove) {
    placeMinesAroundOpening(row, col);
    hasFirstMove = true;
  }

  if (mines.has(id)) {
    gameOver = true;
    revealed.add(id);
    scores.current = 0;
    renderScores();
    renderBoard();
    const button = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (button) button.classList.add("exploded");
    triggerBoardShake();
    replayElementAnimation(currentStreakEl.parentElement, "counter-drop", 520);
    return;
  }

  revealGroup(row, col);
  markRevealAnimation(previousRevealed, row, col);
  checkWin();
  renderBoard();
}

function toggleFlag(row, col) {
  if (gameOver) return;
  const id = key(row, col);
  if (revealed.has(id)) return;

  if (flags.has(id)) {
    flags.delete(id);
    markFlagAnimation(id, false);
  } else {
    if (flags.size >= mineTotal) {
      replayElementAnimation(minePillEl, "mine-pill-pop", 420);
      return;
    }

    flags.add(id);
    markFlagAnimation(id, true);
  }

  replayElementAnimation(minePillEl, "mine-pill-pop", 420);
  checkWin();
  renderBoard();
}

function checkWin() {
  const safeCells = ROWS * COLS - mineTotal;
  if (revealed.size !== safeCells) return;

  gameOver = true;
  for (const mine of mines) {
    flags.add(mine);
  }
  scores.current += 1;
  scores.best = Math.max(scores.best, scores.current);
  renderScores();
  triggerWinAnimation();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chooseMineTotal() {
  return randomInt(MIN_MINES, MAX_MINES);
}

function shuffled(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function placeMinesAroundOpening(openingRow, openingCol) {
  const reserved = new Set([
    key(openingRow, openingCol),
    ...neighbors(openingRow, openingCol).map(([row, col]) => key(row, col)),
  ]);
  const allCells = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const id = key(row, col);
      if (!reserved.has(id)) allCells.push(id);
    }
  }

  mines = new Set(shuffled(allCells).slice(0, mineTotal));
}

function loadRandomBoard() {
  mineTotal = chooseMineTotal();
  mines = new Set();
  revealed = new Set();
  flags = new Set();
  revealAnimationCells = new Set();
  revealAnimationOrigin = null;
  flagAnimationCells = new Set();
  unflagAnimationCells = new Set();
  gameOver = false;
  hasFirstMove = false;
  mode = "dig";
  boardEl.classList.remove("board-shake", "board-win");
  renderMode();
  renderScores();
  renderBoard();
  triggerBoardDrop();
}

boardEl.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  if (suppressNextClick) {
    window.clearTimeout(suppressClickTimer);
    suppressNextClick = false;
    return;
  }

  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);

  if (mode === "flag") {
    toggleFlag(row, col);
  } else {
    revealCell(row, col);
  }
});

boardEl.addEventListener("contextmenu", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  toggleFlag(Number(cell.dataset.row), Number(cell.dataset.col));
});

let pressTimer = 0;
boardEl.addEventListener("pointerdown", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell || event.pointerType === "mouse") return;
  pressTimer = window.setTimeout(() => {
    toggleFlag(Number(cell.dataset.row), Number(cell.dataset.col));
    suppressSyntheticClick();
    pressTimer = 0;
  }, 420);
});

boardEl.addEventListener("pointerup", () => {
  if (pressTimer) window.clearTimeout(pressTimer);
  pressTimer = 0;
});

boardEl.addEventListener("pointerleave", () => {
  if (pressTimer) window.clearTimeout(pressTimer);
  pressTimer = 0;
});

boardEl.addEventListener("pointercancel", () => {
  if (pressTimer) window.clearTimeout(pressTimer);
  pressTimer = 0;
});

digModeButton.addEventListener("click", () => {
  mode = "dig";
  renderMode();
  replayElementAnimation(digModeButton, "tool-pop", 330);
  replayElementAnimation(modeSwitchEl, "mode-switch-pop", 330);
});

flagModeButton.addEventListener("click", () => {
  mode = "flag";
  renderMode();
  replayElementAnimation(flagModeButton, "tool-pop", 330);
  replayElementAnimation(modeSwitchEl, "mode-switch-pop", 330);
});

resetButton.addEventListener("click", () => {
  replayElementAnimation(resetButton, "reset-spin", 560);
  loadRandomBoard();
});

hintButton.addEventListener("click", () => {
  if (gameOver) return;
  replayElementAnimation(hintButton, "hint-pulse", 650);
  const safeHidden = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const id = key(row, col);
      if (!revealed.has(id) && !flags.has(id) && !mines.has(id)) {
        safeHidden.push([row, col]);
      }
    }
  }
  const pick = safeHidden[Math.floor(Math.random() * safeHidden.length)];
  if (pick) revealCell(pick[0], pick[1]);
  if (!pick) replayElementAnimation(hintButton, "hint-empty", 360);
});

renderScores();
renderMode();
setAppScale();
loadRandomBoard();
lockPageZoom();
registerServiceWorker();

window.addEventListener("resize", setAppScale);
window.addEventListener("orientationchange", setAppScale);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", setAppScale);
}
