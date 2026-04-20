const ROWS = 14;
const COLS = 9;
const MINES = 22;

const PRESET_MINES = [
  [2, 2], [2, 4], [2, 5], [2, 8], [3, 1], [3, 8],
  [4, 1], [5, 1], [5, 8], [6, 1], [8, 7], [8, 8],
  [9, 5], [9, 7], [10, 3], [11, 3], [12, 0], [12, 3],
  [12, 4], [12, 6], [13, 7], [13, 8],
];

const PRESET_REVEALED = [
  [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7],
  [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7],
  [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7],
  [6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [6, 7],
  [7, 0], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 6],
  [9, 0], [9, 1], [9, 2], [9, 3], [9, 4], [9, 6],
  [10, 0], [10, 1], [10, 2], [10, 4], [10, 5], [10, 6],
  [11, 0], [11, 1], [11, 2], [11, 4], [11, 5], [11, 6],
];

const PRESET_FLAGS = [
  [6, 1], [8, 7], [9, 5], [10, 3], [11, 3],
];

const boardEl = document.querySelector("#board");
const mineCountEl = document.querySelector("#mineCount");
const currentStreakEl = document.querySelector("#currentStreak");
const allTimeEl = document.querySelector("#allTime");
const digModeButton = document.querySelector("#digMode");
const flagModeButton = document.querySelector("#flagMode");

const storageKey = "photo-minesweeper-scores";
const savedScores = JSON.parse(localStorage.getItem(storageKey) || "null");
let scores = savedScores || { current: 1, best: 8 };
let mode = "flag";
let mines = new Set();
let revealed = new Set();
let flags = new Set();
let gameOver = false;
let hasFirstMove = false;
let suppressNextClick = false;

function key(row, col) {
  return `${row},${col}`;
}

function fromPairs(pairs) {
  return new Set(pairs.map(([row, col]) => key(row, col)));
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
  localStorage.setItem(storageKey, JSON.stringify(scores));
}

function renderMode() {
  digModeButton.classList.toggle("selected", mode === "dig");
  flagModeButton.classList.toggle("selected", mode === "flag");
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
      } else if (gameOver && isMine) {
        className += " mine";
        if (!isFlagged) className += " hidden";
        content = makeMineSvg();
        label += ", mine";
      } else if (isFlagged) {
        className += " flagged";
        content = makeFlagSvg();
        label += ", flagged";
      } else {
        className += " hidden";
      }

      cells.push(`
        <button
          class="${className}"
          type="button"
          data-row="${row}"
          data-col="${col}"
          ${dataCount}
          aria-label="${label}"
        >${content}</button>
      `);
    }
  }

  boardEl.innerHTML = cells.join("");
  mineCountEl.textContent = MINES;
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

  if (!hasFirstMove) {
    protectFirstMove(row, col);
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
    return;
  }

  revealGroup(row, col);
  checkWin();
  renderBoard();
}

function toggleFlag(row, col) {
  if (gameOver) return;
  const id = key(row, col);
  if (revealed.has(id)) return;

  if (flags.has(id)) {
    flags.delete(id);
  } else {
    flags.add(id);
  }

  checkWin();
  renderBoard();
}

function checkWin() {
  const safeCells = ROWS * COLS - MINES;
  if (revealed.size !== safeCells) return;

  gameOver = true;
  for (const mine of mines) {
    flags.add(mine);
  }
  scores.current += 1;
  scores.best = Math.max(scores.best, scores.current);
  renderScores();
}

function protectFirstMove(row, col) {
  const id = key(row, col);
  if (!mines.has(id)) return;

  mines.delete(id);
  for (let nextRow = 0; nextRow < ROWS; nextRow += 1) {
    for (let nextCol = 0; nextCol < COLS; nextCol += 1) {
      const nextId = key(nextRow, nextCol);
      if (nextId !== id && !mines.has(nextId)) {
        mines.add(nextId);
        return;
      }
    }
  }
}

function loadPreset() {
  mines = fromPairs(PRESET_MINES);
  revealed = fromPairs(PRESET_REVEALED);
  flags = fromPairs(PRESET_FLAGS);
  gameOver = false;
  hasFirstMove = true;
  mode = "flag";
  renderMode();
  renderScores();
  renderBoard();
}

function loadRandomBoard() {
  const allCells = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      allCells.push(key(row, col));
    }
  }

  mines = new Set();
  while (mines.size < MINES) {
    mines.add(allCells[Math.floor(Math.random() * allCells.length)]);
  }

  revealed = new Set();
  flags = new Set();
  gameOver = false;
  hasFirstMove = false;
  mode = "dig";
  renderMode();
  renderScores();
  renderBoard();
}

boardEl.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  if (suppressNextClick) {
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
    suppressNextClick = true;
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

digModeButton.addEventListener("click", () => {
  mode = "dig";
  renderMode();
});

flagModeButton.addEventListener("click", () => {
  mode = "flag";
  renderMode();
});

document.querySelector(".back-button").addEventListener("click", loadPreset);
document.querySelector(".reset-button").addEventListener("click", loadRandomBoard);
document.querySelector(".hint-button").addEventListener("click", () => {
  if (gameOver) return;
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
});

renderScores();
renderMode();
loadPreset();
