(() => {
  // Tetris core constants
  const COLS = 10;
  const ROWS = 20;
  const BLOCK = 32; // canvas cell size for main playfield
  const CANVAS_W = COLS * BLOCK; // 320
  const CANVAS_H = ROWS * BLOCK; // 640

  const SHAPES = [
    // I
    [
      [0,0,0,0],
      [1,1,1,1],
      [0,0,0,0],
      [0,0,0,0]
    ],
    // O
    [
      [1,1,0,0],
      [1,1,0,0],
      [0,0,0,0],
      [0,0,0,0]
    ],
    // T
    [
      [0,1,0,0],
      [1,1,1,0],
      [0,0,0,0],
      [0,0,0,0]
    ],
    // S
    [
      [0,1,1,0],
      [1,1,0,0],
      [0,0,0,0],
      [0,0,0,0]
    ],
    // Z
    [
      [1,1,0,0],
      [0,1,1,0],
      [0,0,0,0],
      [0,0,0,0]
    ],
    // J
    [
      [1,0,0,0],
      [1,1,1,0],
      [0,0,0,0],
      [0,0,0,0]
    ],
    // L
    [
      [0,0,1,0],
      [1,1,1,0],
      [0,0,0,0],
      [0,0,0,0]
    ]
  ];

  const PIECE_COLORS = [
    '#00f0f5', // I
    '#f5c542', // O
    '#a55ee1', // T
    '#2ecc71', // S
    '#e74c3c', // Z
    '#3498db', // J
    '#f1c40f'  // L
  ];

  // Game state
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  let current = null; // active piece
  let nextQueue = [];
  let hold = -1; // held piece type
  let holdUsedThisDrop = false;

  let score = 0;
  let level = 1;
  let linesCleared = 0;

  let gameOver = false;
  let paused = false;

  // Canvas and rendering
  const gameCanvas = document.getElementById('gameCanvas');
  const ctx = gameCanvas.getContext('2d');
  const holdCanvas = document.getElementById('holdCanvas');
  const holdCtx = holdCanvas.getContext('2d');
  const nextCanvases = [document.getElementById('next0'), document.getElementById('next1'), document.getElementById('next2')];
  const nextContexts = nextCanvases.map(c => c.getContext('2d'));

  // mini drawing helpers
  const MINI_BLOCK = 20; // mini grid block size

  function cloneMatrix(m) {
    return m.map(row => row.slice());
  }

  function rotateMatrix(matrix) {
    const size = matrix.length;
    const res = Array.from({ length: size }, () => Array(size).fill(0));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        res[x][size - 1 - y] = matrix[y][x];
      }
    }
    return res;
  }

  function canPosition(matrix, x, y) {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (matrix[i][j]) {
          const newX = x + j;
          const newY = y + i;
          if (newX < 0 || newX >= COLS || newY < 0 || newY >= ROWS) return false;
          if (board[newY][newX] !== 0) return false;
        }
      }
    }
    return true;
  }

  function spawnPiece() {
    if (nextQueue.length === 0) refillQueue();
    const type = nextQueue.shift();
    const matrix = cloneMatrix(SHAPES[type]);
    return {
      type,
      matrix,
      x: Math.floor((COLS - 4) / 2),
      y: 0,
      color: PIECE_COLORS[type]
    };
  }

  function refillQueue() {
    // simple bag: shuffle 0..6
    const bag = [0,1,2,3,4,5,6];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    nextQueue = nextQueue.concat(bag);
  }

  function drawCell(x, y, color, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
    // border
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
  }

  function drawBoard() {
    // background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * BLOCK, 0); ctx.lineTo(c * BLOCK, CANVAS_H); ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * BLOCK); ctx.lineTo(CANVAS_W, r * BLOCK); ctx.stroke();
    }

    // locked blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = board[r][c];
        if (v !== 0) {
          drawCell(c, r, PIECE_COLORS[v - 1]);
        }
      }
    }

    // ghost piece
    if (current) {
      const ghostY = getGhostY(current);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          if (current.matrix[i][j]) {
            const gx = current.x + j;
            const gy = current.y + i;
            if (gy < 0) continue;
            if (gy >= ROWS || gx < 0 || gx >= COLS) continue;
            // If spot is empty in board, draw ghost with alpha
            if (board[gy][gx] === 0) {
              drawCell(gx, gy, current.color, 0.25);
            }
          }
        }
      }
    }

    // current piece
    if (current) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          if (current.matrix[i][j]) {
            const x = current.x + j;
            const y = current.y + i;
            if (y < 0) continue;
            if (y >= ROWS || x < 0 || x >= COLS) continue;
            drawCell(x, y, current.color);
          }
        }
      }
    }
  }

  function getGhostY(p) {
    let gy = p.y;
    while (canPosition(p.matrix, p.x, gy + 1)) {
      gy++;
    }
    return gy;
  }

  function lockPiece() {
    // write to board
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        if (current.matrix[i][j]) {
          const x = current.x + j;
          const y = current.y + i;
          if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
            board[y][x] = current.type + 1; // store color index offset by 1
          }
        }
      }
    }
    // check lines
    let lines = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r].every(v => v !== 0)) {
        lines.push(r);
      }
    }
    if (lines.length > 0) {
      for (const r of lines) {
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(0));
      }
      // scoring: 1,2,3,4 lines
      const scoreAdd = lines.length;
      const tier = level;
      const pointsMap = {1:40, 2:100, 3:300, 4:1200};
      const add = (pointsMap[lines.length] || 0) * tier;
      score += add;
      linesCleared += lines.length;
      const nextLevel = Math.floor(linesCleared / 10) + 1;
      if (nextLevel > level) {
        level = nextLevel;
      }
    }

    // spawn next piece
    current = spawnPiece();
    if (!canPosition(current.matrix, current.x, current.y)) {
      // game over
      gameOver = true;
      paused = true;
      showOverlay('Game Over\nPress Start to play again');
    }
    holdUsedThisDrop = false;
    updateHUD();
  }

  function updateHUD() {
    document.getElementById('score').textContent = score;
    document.getElementById('level').textContent = level;
    document.getElementById('lines').textContent = linesCleared;
  }

  function canMove(dx, dy) {
    if (!current) return false;
    const nx = current.x + dx;
    const ny = current.y + dy;
    return canPosition(current.matrix, nx, ny);
  }

  function tryRotate() {
    if (!current) return;
    const rotated = rotateMatrix(current.matrix);
    // wall kicks attempts
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (canPosition(rotated, current.x + k, current.y)) {
        current.matrix = rotated;
        current.x += k;
        return;
      }
    }
  }

  function hardDrop() {
    if (!current) return;
    while (canPosition(current.matrix, current.x, current.y + 1)) {
      current.y++;
    }
    lockPiece();
  }

  function showOverlay(message) {
    const overlay = document.getElementById('overlay');
    const content = document.getElementById('overlayContent');
    content.textContent = message;
    overlay.style.display = 'flex';
  }

  function hideOverlay() {
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'none';
  }

  function resetBoard() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) board[r][c] = 0;
    }
  }

  function spawnInitialPieces() {
    refillQueue();
    current = spawnPiece();
    if (!canPosition(current.matrix, current.x, current.y)) {
      gameOver = true;
    }
  }

  // input handling
  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (gameOver && e.key !== 'Enter') return;
    if (e.repeat) return;
    switch (e.key) {
      case 'ArrowLeft': case 'a':
        if (!paused && canMove(-1, 0)) current.x--;
        break;
      case 'ArrowRight': case 'd':
        if (!paused && canMove(1, 0)) current.x++;
        break;
      case 'ArrowDown': case 's':
        // soft drop: move down if possible
        if (!paused && canMove(0, 1)) current.y++;
        break;
      case 'ArrowUp': case 'w':
        if (!paused) tryRotate();
        break;
      case ' ': // space hard drop
        if (!paused) hardDrop();
        break;
      case 'c':
      case 'C':
        if (!paused && !holdUsedThisDrop) {
          if (hold === -1) {
            hold = current.type;
            // fetch next piece as current
            current = spawnPiece();
            if (!canPosition(current.matrix, current.x, current.y)) {
              gameOver = true; paused = true; showOverlay('Game Over\nPress Start to play again');
            }
          } else {
            const tmp = hold;
            hold = current.type;
            current = {
              type: tmp,
              matrix: cloneMatrix(SHAPES[tmp]),
              x: Math.floor((COLS - 4) / 2),
              y: 0,
              color: PIECE_COLORS[tmp]
            };
          }
          holdUsedThisDrop = true;
          render();
        }
        break;
      case 'p': case 'P':
        togglePause();
        break;
      default:
        break;
    }
    render();
  });

  window.addEventListener('keyup', () => {});

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) {
      showOverlay('Paused');
    } else {
      hideOverlay();
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }

  // on-screen controls (mobile)
  document.querySelectorAll('.mobile-controls .control').forEach(btn => {
    btn.addEventListener('mousedown', () => actionFromControl(btn.dataset.action));
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); actionFromControl(btn.dataset.action); }, {passive:false});
  });

  function actionFromControl(action) {
    if (gameOver) return;
    if (paused) return;
    if (action === 'left') {
      if (canMove(-1,0)) current.x--;
    } else if (action === 'right') {
      if (canMove(1,0)) current.x++;
    } else if (action === 'rotate') {
      tryRotate();
    } else if (action === 'softDrop') {
      if (canMove(0,1)) current.y++;
    } else if (action === 'hardDrop') {
      hardDrop();
    } else if (action === 'hold') {
      if (!holdUsedThisDrop) {
        if (hold === -1) {
          hold = current.type;
          current = spawnPiece();
        } else {
          const tmp = hold; hold = current.type; current = {
            type: tmp, matrix: cloneMatrix(SHAPES[tmp]), x: Math.floor((COLS - 4) / 2), y: 0, color: PIECE_COLORS[tmp]
          };
        }
        holdUsedThisDrop = true;
        render();
        return;
      }
    }
    render();
  }

  // game loop
  let lastTime = 0;
  let dropAccumulator = 0;
  let tick = 0; // not used now
  function loop(ts) {
    if (gameOver) {
      render();
      return;
    }
    if (!paused) {
      const delta = (ts - lastTime) || 0;
      lastTime = ts;
      // auto drop timing
      const interval = Math.max(100, 800 - (level - 1) * 50);
      dropAccumulator += delta;
      while (dropAccumulator >= interval) {
        if (current && canMove(0, 1)) {
          current.y++;
        } else {
          lockPiece();
        }
        dropAccumulator -= interval;
      }
      render();
    }
    requestAnimationFrame(loop);
  }

  function render() {
    drawBoard();
    // hold preview
    drawMini(hold, holdCtx, holdCanvas.width, holdCanvas.height);
    // next previews
    nextContexts.forEach((ctxMini, idx) => {
      const type = nextQueue[idx];
      const w = nextCanvases[idx].width; const h = nextCanvases[idx].height;
      drawMiniInContext(ctxMini, type, w, h);
    });
  }

  function drawMini(type, ctxMini, w, h) {
    ctxMini.clearRect(0,0,w,h);
    if (type === -1) return;
    const m = SHAPES[type];
    const color = PIECE_COLORS[type];
    // center in a 4x4 grid
    const cell = Math.min(w, h) / 4;
    for (let r=0;r<4;r++){
      for (let c=0;c<4;c++){
        if (m[r][c]) {
          ctxMini.fillStyle = color;
          ctxMini.fillRect(c*cell+2, r*cell+2, cell-4, cell-4);
        }
      }
    }
  }

  function drawMiniInContext(ctxMini, type, w, h) {
    ctxMini.clearRect(0,0,w,h);
    if (type === undefined) return;
    if (type === -1) return;
    const m = SHAPES[type];
    const color = PIECE_COLORS[type];
    const cell = Math.min(w, h) / 4;
    for (let r=0;r<4;r++){
      for (let c=0;c<4;c++){
        if (m[r][c]) {
          ctxMini.fillStyle = color;
          ctxMini.fillRect(c*cell+2, r*cell+2, cell-4, cell-4);
        }
      }
    }
  }

  // initialize
  function init() {
    resetBoard();
    refillQueue();
    hold = -1; holdUsedThisDrop = false;
    current = spawnPiece();
    if (!canPosition(current.matrix, current.x, current.y)) {
      gameOver = true; showOverlay('Game Over\nPress Start to play again');
    }
    updateHUD();
    // initial previews
    render();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  // start controls
  document.getElementById('startBtn').addEventListener('click', () => {
    gameOver = false; paused = false;
    resetBoard(); refillQueue(); hold = -1; holdUsedThisDrop = false; score = 0; level = 1; linesCleared = 0;
    updateHUD();
    current = spawnPiece();
    if (!canPosition(current.matrix, current.x, current.y)) {
      showOverlay('Game Over');
      gameOver = true;
    }
    hideOverlay();
    render();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  });
  document.getElementById('pauseBtn').addEventListener('click', togglePause);

  // touch to click overlay to restart
  document.getElementById('overlay').addEventListener('click', () => {
    if (gameOver) {
      document.getElementById('startBtn').click();
    }
  });

  // run
  init();
})();
