const DEFAULT_ROWS = 14;
const DEFAULT_COLS = 9;
const MIN_ROWS = 1;
const MAX_ROWS = 18;
const MIN_COLS = 4;
const MAX_COLS = 12;
const BOARD_WIDTH = 338;
const BOARD_HEIGHT = 528;
const CELL_GAP = 4;
const MIN_CELL_SIZE = 22;
const MAX_CELL_SIZE = 42;
const DESIGN_WIDTH = 375;
const DESIGN_HEIGHT = 768;
const MAX_SCALE = 1.16;
const TAP_MOVE_LIMIT = 12;
const DIFFICULTIES = Object.freeze({
  easy: { minDensity: 0.1, maxDensity: 0.14 },
  normal: { minDensity: 0.16, maxDensity: 0.2 },
  hard: { minDensity: 0.22, maxDensity: 0.26 },
  extreme: { minDensity: 0.3, maxDensity: 0.34 },
});

const boardEl = document.querySelector("#board");
const mineCountEl = document.querySelector("#mineCount");
const currentStreakEl = document.querySelector("#currentStreak");
const allTimeEl = document.querySelector("#allTime");
const digModeButton = document.querySelector("#digMode");
const flagModeButton = document.querySelector("#flagMode");
const resetButton = document.querySelector(".reset-button");
const settingsButton = document.querySelector(".settings-button");
const settingsPanel = document.querySelector("#settingsPanel");
const settingsCloseButton = document.querySelector("#settingsClose");
const settingsApplyButton = document.querySelector("#settingsApply");
const settingsClassicButton = document.querySelector("#settingsClassic");
const colsDownButton = document.querySelector("#colsDown");
const colsUpButton = document.querySelector("#colsUp");
const rowsDownButton = document.querySelector("#rowsDown");
const rowsUpButton = document.querySelector("#rowsUp");
const colsValueEl = document.querySelector("#colsValue");
const rowsValueEl = document.querySelector("#rowsValue");
const difficultyButtons = [...document.querySelectorAll("[data-difficulty]")];
const hintButton = document.querySelector(".hint-button");
const hintCountEl = hintButton.querySelector("span");
const minePillEl = document.querySelector(".mine-pill");

const storageKey = "minesweeper-scores-v2";
const settingsStorageKey = "minesweeper-settings-v1";
const savedScores = readSavedScores();
let settings = readSavedSettings();
let pendingSettings = { ...settings };
let rows = settings.rows;
let cols = settings.cols;
let scores = savedScores || { current: 0, best: 0, hints: 0 };
let hintsRemaining = scores.hints;
let mineTotal = chooseMineTotal();
let mode = "flag";
let mines = new Set();
let revealed = new Set();
let flags = new Set();
let gameOver = false;
let hasFirstMove = false;
let suppressNextClick = false;
let suppressClickCell = null;
let suppressAnyClick = false;
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
let settingsCloseTimer = 0;
let boardInteractionLockedUntil = 0;
let touchPress = null;
const BOARD_DROP_LOCK_MS = 260;

function setAppScale() {
  const viewport = window.visualViewport;
  const viewportWidth = viewport ? viewport.width : window.innerWidth;
  const viewportHeight = viewport ? viewport.height : window.innerHeight;
  const scale = Math.min(
    viewportWidth / DESIGN_WIDTH,
    viewportHeight / DESIGN_HEIGHT,
    MAX_SCALE
  );
  document.documentElement.style.setProperty("--app-scale", Math.max(0.1, scale).toFixed(4));
}

function lockPageZoom() {
  const prevent = (event) => event.preventDefault();

  document.addEventListener("gesturestart", prevent, { passive: false });
  document.addEventListener("gesturechange", prevent, { passive: false });
  document.addEventListener("gestureend", prevent, { passive: false });
  document.addEventListener("touchmove", (event) => {
    event.preventDefault();
  }, { passive: false });

  window.addEventListener("scroll", () => {
    window.scrollTo(0, 0);
  }, { passive: true });

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
    const cleanCurrent = Math.max(0, Math.floor(current));
    const savedHints = Number.isFinite(parsed.hints) ? parsed.hints : null;
    const milestoneCount = Math.floor(cleanCurrent / 5);
    const fallbackHints = (milestoneCount * (milestoneCount + 1)) / 2;
    const hints = savedHints === null ? fallbackHints : savedHints;

    return {
      current: cleanCurrent,
      best: Math.max(0, Math.floor(best)),
      hints: cleanCurrent > 0 ? Math.max(0, Math.floor(hints)) : 0,
    };
  } catch {
    return null;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function readSavedSettings() {
  try {
    const value = localStorage.getItem(settingsStorageKey);
    if (!value) {
      return {
        rows: DEFAULT_ROWS,
        cols: DEFAULT_COLS,
        difficulty: "normal",
      };
    }

    const parsed = JSON.parse(value);
    const savedRows = Number.isFinite(parsed.rows) ? Math.floor(parsed.rows) : DEFAULT_ROWS;
    const savedCols = Number.isFinite(parsed.cols) ? Math.floor(parsed.cols) : DEFAULT_COLS;
    const savedDifficulty = DIFFICULTIES[parsed.difficulty] ? parsed.difficulty : "normal";

    return {
      rows: clamp(savedRows, MIN_ROWS, MAX_ROWS),
      cols: clamp(savedCols, MIN_COLS, MAX_COLS),
      difficulty: savedDifficulty,
    };
  } catch {
    return {
      rows: DEFAULT_ROWS,
      cols: DEFAULT_COLS,
      difficulty: "normal",
    };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    // Private browsing modes can make localStorage unavailable.
  }
}

function renderSettingsControls() {
  colsValueEl.textContent = pendingSettings.cols;
  rowsValueEl.textContent = pendingSettings.rows;
  colsDownButton.disabled = pendingSettings.cols <= MIN_COLS;
  colsUpButton.disabled = pendingSettings.cols >= MAX_COLS;
  rowsDownButton.disabled = pendingSettings.rows <= MIN_ROWS;
  rowsUpButton.disabled = pendingSettings.rows >= MAX_ROWS;

  for (const button of difficultyButtons) {
    const isSelected = button.dataset.difficulty === pendingSettings.difficulty;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", isSelected ? "true" : "false");
  }
}

function changePendingSetting(name, delta) {
  const limits = name === "cols"
    ? [MIN_COLS, MAX_COLS]
    : [MIN_ROWS, MAX_ROWS];
  pendingSettings[name] = clamp(pendingSettings[name] + delta, limits[0], limits[1]);
  renderSettingsControls();
}

function setPendingClassicSettings() {
  pendingSettings = {
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    difficulty: "normal",
  };
  renderSettingsControls();
  replayElementAnimation(settingsClassicButton, "settings-control-pop", 260);
}

function openSettings() {
  window.clearTimeout(settingsCloseTimer);
  pendingSettings = { ...settings };
  renderSettingsControls();
  settingsPanel.hidden = false;
  settingsPanel.classList.remove("settings-closing");
  replayElementAnimation(settingsButton, "settings-pop", 390);
}

function closeSettings() {
  if (settingsPanel.hidden || settingsPanel.classList.contains("settings-closing")) return;

  window.clearTimeout(settingsCloseTimer);
  settingsPanel.classList.add("settings-closing");
  settingsCloseTimer = window.setTimeout(() => {
    settingsPanel.hidden = true;
    settingsPanel.classList.remove("settings-closing");
  }, 170);
}

function applySettings() {
  const didChange = pendingSettings.rows !== settings.rows
    || pendingSettings.cols !== settings.cols
    || pendingSettings.difficulty !== settings.difficulty;

  settings = { ...pendingSettings };
  rows = settings.rows;
  cols = settings.cols;
  saveSettings();
  closeSettings();
  replayElementAnimation(settingsApplyButton, "settings-control-pop", 260);

  if (didChange) {
    loadRandomBoard();
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
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
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
    <img class="cell-flag-icon" src="assets/flag-red.png" alt="" aria-hidden="true">
  `;
}

function makeMineSvg() {
  return `
    <img class="cell-bomb-icon" src="assets/bomb.png" alt="" aria-hidden="true">
  `;
}

function renderScores() {
  currentStreakEl.textContent = scores.current;
  allTimeEl.textContent = scores.best;
  scores.hints = Math.max(0, Math.floor(hintsRemaining));
  try {
    localStorage.setItem(storageKey, JSON.stringify(scores));
  } catch {
    // Private browsing modes can make localStorage unavailable.
  }
}

function hintRewardForStreak() {
  if (scores.current === 0 || scores.current % 5 !== 0) return 0;
  return scores.current / 5;
}

function renderHintButton() {
  const count = Math.max(0, hintsRemaining);
  hintCountEl.textContent = count;
  hintButton.classList.toggle("hint-locked", count === 0);
  hintButton.setAttribute(
    "aria-label",
    count === 1 ? "Hint, 1 left" : `Hint, ${count} left`
  );
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

function suppressSyntheticClick(id, options = {}) {
  window.clearTimeout(suppressClickTimer);
  suppressNextClick = true;
  suppressClickCell = id;
  suppressAnyClick = Boolean(options.any);
  suppressClickTimer = window.setTimeout(() => {
    suppressNextClick = false;
    suppressClickCell = null;
    suppressAnyClick = false;
  }, options.duration || 700);
}

function clearPressTimer() {
  if (pressTimer) window.clearTimeout(pressTimer);
  pressTimer = 0;
}

function updateBoardSizing() {
  const widthCell = Math.floor((BOARD_WIDTH - (cols - 1) * CELL_GAP) / cols);
  const heightCell = Math.floor((BOARD_HEIGHT - (rows - 1) * CELL_GAP) / rows);
  const cellSize = clamp(Math.min(widthCell, heightCell, MAX_CELL_SIZE), MIN_CELL_SIZE, MAX_CELL_SIZE);
  const fontSize = clamp(Math.round(cellSize * 0.86), 18, 30);
  const iconSize = clamp(Math.round(cellSize * 1.04), 22, 38);
  const flagSize = clamp(Math.round(cellSize * 0.62), 14, 24);

  boardEl.style.setProperty("--cols", cols);
  boardEl.style.setProperty("--rows", rows);
  boardEl.style.setProperty("--cell-size", `${cellSize}px`);
  boardEl.style.setProperty("--cell-gap", `${CELL_GAP}px`);
  boardEl.style.setProperty("--cell-font-size", `${fontSize}px`);
  boardEl.style.setProperty("--cell-icon-size", `${iconSize}px`);
  boardEl.style.setProperty("--cell-flag-size", `${flagSize}px`);
}

function renderBoard() {
  updateBoardSizing();
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
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
        if (unflagAnimationCells.has(id)) {
          className += " flag-removed";
          content = makeFlagSvg();
        }
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
  const remainingMines = Math.max(0, mineTotal - flags.size);
  mineCountEl.textContent = remainingMines;
  minePillEl.dataset.digits = String(remainingMines).length;
}

function syncMineCounter() {
  const remainingMines = Math.max(0, mineTotal - flags.size);
  mineCountEl.textContent = remainingMines;
  minePillEl.dataset.digits = String(remainingMines).length;
}

function syncCell(row, col) {
  const button = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (!button) return;

  const id = key(row, col);
  const isRevealed = revealed.has(id);
  const isFlagged = flags.has(id);
  const isMine = mines.has(id);
  const count = countAdjacentMines(row, col);

  let className = "cell";
  let label = `Cell ${row + 1}, ${col + 1}`;
  let content = "";
  let dataCount = "";

  if (isRevealed) {
    className += " revealed";
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
  } else {
    className += " hidden";
    if (unflagAnimationCells.has(id)) {
      className += " flag-removed";
      content = makeFlagSvg();
    }
  }

  button.className = className;
  button.setAttribute("aria-label", label);
  if (dataCount) button.setAttribute("data-count", dataCount.match(/\d+/)?.[0] || "0");
  else button.removeAttribute("data-count");
  button.innerHTML = content;
}

function cancelBoardDropAnimation() {
  window.clearTimeout(boardDropTimer);
  const dropCells = [...boardEl.querySelectorAll(".cell-drop-in")];
  for (const cell of dropCells) {
    cell.classList.remove("cell-drop-in");
  }
}

function triggerBoardDrop() {
  cancelBoardDropAnimation();
  const dropCells = [...boardEl.querySelectorAll(".cell.hidden, .cell.flagged")];
  void boardEl.offsetWidth;
  for (const cell of dropCells) {
    cell.classList.add("cell-drop-in");
  }
  boardDropTimer = window.setTimeout(() => {
    for (const cell of dropCells) {
      if (cell.isConnected) cell.classList.remove("cell-drop-in");
    }
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

function markRevealAnimation(previousRevealed, originRow, originCol, options = {}) {
  window.clearTimeout(revealAnimationTimer);
  const maxCells = options.maxCells || Infinity;
  const nextCells = [...revealed]
    .filter((id) => !previousRevealed.has(id))
    .sort((left, right) => {
      const [leftRow, leftCol] = left.split(",").map(Number);
      const [rightRow, rightCol] = right.split(",").map(Number);
      const leftDistance = Math.abs(leftRow - originRow) + Math.abs(leftCol - originCol);
      const rightDistance = Math.abs(rightRow - originRow) + Math.abs(rightCol - originCol);
      return leftDistance - rightDistance;
    });

  revealAnimationCells = new Set(nextCells.slice(0, maxCells));
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
  cancelBoardDropAnimation();
  const previousRevealed = new Set(revealed);
  const isOpeningMove = !hasFirstMove;

  if (!hasFirstMove) {
    placeMinesAroundOpening(row, col);
    hasFirstMove = true;
  }

  if (mines.has(id)) {
    gameOver = true;
    revealed.add(id);
    scores.current = 0;
    hintsRemaining = 0;
    renderScores();
    renderHintButton();
    renderBoard();
    const button = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (button) button.classList.add("exploded");
    triggerBoardShake();
    replayElementAnimation(minePillEl, "mine-pill-danger", 680);
    replayElementAnimation(currentStreakEl.parentElement, "counter-drop", 520);
    return;
  }

  revealGroup(row, col);
  markRevealAnimation(previousRevealed, row, col, { maxCells: isOpeningMove ? 12 : Infinity });
  checkWin();
  renderBoard();
}

function revealAroundNumber(row, col) {
  if (gameOver) return false;
  const id = key(row, col);
  if (!revealed.has(id)) return false;
  cancelBoardDropAnimation();

  const count = countAdjacentMines(row, col);
  if (count === 0) return false;

  const around = neighbors(row, col);
  const flaggedAround = around.filter(([nextRow, nextCol]) => flags.has(key(nextRow, nextCol)));
  if (flaggedAround.length !== count) return false;

  const flagsAreCorrect = flaggedAround.every(([nextRow, nextCol]) => mines.has(key(nextRow, nextCol)));
  if (!flagsAreCorrect) {
    triggerBoardShake();
    return true;
  }

  const previousRevealed = new Set(revealed);
  for (const [nextRow, nextCol] of around) {
    const nextId = key(nextRow, nextCol);
    if (!revealed.has(nextId) && !flags.has(nextId) && !mines.has(nextId)) {
      revealGroup(nextRow, nextCol);
    }
  }

  if (revealed.size === previousRevealed.size) return true;

  markRevealAnimation(previousRevealed, row, col);
  checkWin();
  renderBoard();
  return true;
}

function toggleFlag(row, col) {
  if (gameOver) return;
  const id = key(row, col);
  if (revealed.has(id)) return;
  const isFlagging = !flags.has(id);

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
  syncMineCounter();
  syncCell(row, col);

  if (!isFlagging) {
    window.setTimeout(() => {
      if (!flags.has(id) && !revealed.has(id)) syncCell(row, col);
    }, 540);
  }
}

function checkWin() {
  const safeCells = rows * cols - mineTotal;
  if (revealed.size !== safeCells) return;

  gameOver = true;
  for (const mine of mines) {
    flags.add(mine);
  }
  scores.current += 1;
  scores.best = Math.max(scores.best, scores.current);
  const earnedHints = hintRewardForStreak();
  if (earnedHints > 0) {
    hintsRemaining += earnedHints;
    replayElementAnimation(hintButton, "hint-award", 760);
  }
  renderScores();
  renderHintButton();
  triggerWinAnimation();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function chooseMineTotal() {
  const cellCount = rows * cols;
  const difficulty = DIFFICULTIES[settings.difficulty] || DIFFICULTIES.normal;
  const maxAllowed = Math.max(1, cellCount - 10);
  const min = Math.min(maxAllowed, Math.max(1, Math.round(cellCount * difficulty.minDensity)));
  const max = Math.min(maxAllowed, Math.max(min, Math.round(cellCount * difficulty.maxDensity)));

  return randomInt(min, max);
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

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const id = key(row, col);
      if (!reserved.has(id)) allCells.push(id);
    }
  }

  mines = new Set(shuffled(allCells).slice(0, mineTotal));
  mineTotal = mines.size;
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
  boardEl.classList.remove("board-shake", "board-win");
  renderMode();
  renderScores();
  renderHintButton();
  renderBoard();
  boardInteractionLockedUntil = window.performance.now() + BOARD_DROP_LOCK_MS;
  triggerBoardDrop();
}

boardEl.addEventListener("click", (event) => {
  if (window.performance.now() < boardInteractionLockedUntil) return;
  const cell = event.target.closest(".cell");
  if (!cell) return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const id = key(row, col);

  if (suppressNextClick) {
    const shouldSuppress = suppressAnyClick || suppressClickCell === id;
    window.clearTimeout(suppressClickTimer);
    suppressNextClick = false;
    suppressClickCell = null;
    suppressAnyClick = false;
    if (shouldSuppress) return;
  }

  if (revealAroundNumber(row, col)) return;

  if (mode === "flag") {
    toggleFlag(row, col);
  } else {
    revealCell(row, col);
  }
});

boardEl.addEventListener("contextmenu", (event) => {
  if (window.performance.now() < boardInteractionLockedUntil) return;
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  toggleFlag(Number(cell.dataset.row), Number(cell.dataset.col));
});

let pressTimer = 0;
boardEl.addEventListener("pointerdown", (event) => {
  if (window.performance.now() < boardInteractionLockedUntil) return;
  const cell = event.target.closest(".cell");
  if (!cell || event.pointerType === "mouse") return;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  touchPress = {
    cellId: key(row, col),
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
  pressTimer = window.setTimeout(() => {
    toggleFlag(row, col);
    suppressSyntheticClick(key(row, col));
    pressTimer = 0;
  }, 420);
});

boardEl.addEventListener("pointermove", (event) => {
  if (!touchPress || touchPress.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - touchPress.startX;
  const deltaY = event.clientY - touchPress.startY;

  if (Math.hypot(deltaX, deltaY) > TAP_MOVE_LIMIT) {
    touchPress.moved = true;
    clearPressTimer();
  }
});

boardEl.addEventListener("pointerup", (event) => {
  clearPressTimer();
  if (touchPress && touchPress.pointerId === event.pointerId && touchPress.moved) {
    suppressSyntheticClick(touchPress.cellId, { any: true, duration: 350 });
  }
  touchPress = null;
});

boardEl.addEventListener("pointerleave", () => {
  clearPressTimer();
  if (touchPress) {
    suppressSyntheticClick(touchPress.cellId, { any: true, duration: 350 });
    touchPress = null;
  }
});

boardEl.addEventListener("pointercancel", () => {
  clearPressTimer();
  if (touchPress) {
    suppressSyntheticClick(touchPress.cellId, { any: true, duration: 350 });
    touchPress = null;
  }
});

digModeButton.addEventListener("click", () => {
  mode = "dig";
  renderMode();
  replayElementAnimation(digModeButton, "tool-pop", 330);
});

flagModeButton.addEventListener("click", () => {
  mode = "flag";
  renderMode();
  replayElementAnimation(flagModeButton, "tool-pop", 330);
});

resetButton.addEventListener("click", () => {
  replayElementAnimation(resetButton, "reset-spin", 560);
  loadRandomBoard();
});

settingsButton.addEventListener("click", () => {
  if (settingsPanel.hidden || settingsPanel.classList.contains("settings-closing")) {
    openSettings();
  } else {
    closeSettings();
  }
});

settingsCloseButton.addEventListener("click", closeSettings);

settingsPanel.addEventListener("click", (event) => {
  if (event.target === settingsPanel) closeSettings();
});

colsDownButton.addEventListener("click", () => changePendingSetting("cols", -1));
colsUpButton.addEventListener("click", () => changePendingSetting("cols", 1));
rowsDownButton.addEventListener("click", () => changePendingSetting("rows", -1));
rowsUpButton.addEventListener("click", () => changePendingSetting("rows", 1));
settingsClassicButton.addEventListener("click", setPendingClassicSettings);

for (const button of difficultyButtons) {
  button.addEventListener("click", () => {
    pendingSettings.difficulty = DIFFICULTIES[button.dataset.difficulty]
      ? button.dataset.difficulty
      : "normal";
    renderSettingsControls();
    replayElementAnimation(button, "settings-control-pop", 260);
  });
}

settingsApplyButton.addEventListener("click", applySettings);

hintButton.addEventListener("click", () => {
  if (gameOver) return;
  if (hintsRemaining <= 0) {
    replayElementAnimation(hintButton, "hint-empty", 360);
    return;
  }

  const safeHidden = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const id = key(row, col);
      if (!revealed.has(id) && !flags.has(id) && !mines.has(id)) {
        safeHidden.push([row, col]);
      }
    }
  }
  const pick = safeHidden[Math.floor(Math.random() * safeHidden.length)];
  if (!pick) {
    replayElementAnimation(hintButton, "hint-empty", 360);
    return;
  }

  hintsRemaining -= 1;
  renderHintButton();
  renderScores();
  replayElementAnimation(hintButton, "hint-pulse", 650);
  revealCell(pick[0], pick[1]);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !settingsPanel.hidden) closeSettings();
});

renderScores();
renderMode();
renderSettingsControls();
setAppScale();
loadRandomBoard();
lockPageZoom();
registerServiceWorker();

window.addEventListener("resize", setAppScale);
window.addEventListener("orientationchange", setAppScale);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", setAppScale);
}
