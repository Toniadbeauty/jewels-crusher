/* Match-3 starter engine
   - 8x8 grid
   - 6 tile types (0..5)
   - click/tap to select, swap adjacent
   - auto-detect matches, remove, cascade, refill
   - score & moves limit
*/

/* CONFIG */
const COLS = 8, ROWS = 8;
const TYPES = 6;          // number of different tile types/colors
const STARTING_MOVES = 30;
const MATCH_MIN = 3;      // minimum tiles in a match

/* STATE */
const boardEl = document.getElementById('board');
const scoreEl = document.getElementById('score');
const movesEl = document.getElementById('moves');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayMsg = document.getElementById('overlayMsg');
const playAgainBtn = document.getElementById('playAgain');
const shuffBtn = document.getElementById('shuffBtn');
const restartBtn = document.getElementById('restartBtn');

let grid = [];        // 2D array [row][col] storing tile objects
let score = 0;
let moves = STARTING_MOVES;
let selected = null;  // {r,c,el}
let processing = false;

/* UTIL */
const idx = (r,c) => r*COLS + c;
const inBounds = (r,c) => r>=0 && r<ROWS && c>=0 && c<COLS;
const rand = (n) => Math.floor(Math.random()*n);

/* Initialize board DOM + data */
function init(){
  boardEl.innerHTML = '';
  boardEl.style.gridTemplateColumns = `repeat(${COLS}, var(--tile-size))`;
  grid = Array.from({length: ROWS}, ()=>Array(COLS).fill(null));
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell = createTile(r,c, randomTypeSafe(r,c));
      boardEl.appendChild(cell.el);
      grid[r][c] = cell;
    }
  }
  score = 0; moves = STARTING_MOVES;
  updateHUD();
  // ensure no initial matches
  window.requestAnimationFrame(()=>{ removeInitialMatches().then(()=>{}) });
}

/* create tile object */
function createTile(r,c,type){
  const el = document.createElement('div');
  el.className = `tile type-${type}`;
  el.dataset.r = r; el.dataset.c = c;
  el.dataset.type = type;
  el.setAttribute('role','button');
  el.addEventListener('click', onTileClick);
  return { r,c,type,el };
}

/* pick type avoiding immediate match (simple approach) */
function randomTypeSafe(r,c){
  // naive: try random until no match would form
  let tries=0;
  while(true){
    const t = rand(TYPES);
    if(tries>15) return t;
    // check left-left and up-up patterns
    if(c>=2 && grid[r] && grid[r][c-1] && grid[r][c-2] && grid[r][c-1].type===t && grid[r][c-2].type===t){ tries++; continue }
    if(r>=2 && grid[r-1] && grid[r-2] && grid[r-1][c].type===t && grid[r-2][c].type===t){ tries++; continue }
    return t;
  }
}

/* click handler */
function onTileClick(e){
  if(processing) return;
  const el = e.currentTarget;
  const r = +el.dataset.r, c = +el.dataset.c;
  if(!selected){
    selectTile(r,c,el);
    return;
  }
  // if same tile: deselect
  if(selected.r === r && selected.c === c){ deselect(); return; }
  // if adjacent, try swap
  if(isAdjacent(selected.r,selected.c,r,c)){
    attemptSwap(selected.r,selected.c,r,c);
  } else {
    // select the new tile
    deselect();
    selectTile(r,c,el);
  }
}

function selectTile(r,c,el){
  selected = {r,c,el};
  el.classList.add('selected');
}

function deselect(){
  if(selected?.el) selected.el.classList.remove('selected');
  selected = null;
}

function isAdjacent(r1,c1,r2,c2){
  const dr = Math.abs(r1-r2), dc = Math.abs(c1-c2);
  return (dr+dc)===1;
}

/* swap visuals + data */
async function attemptSwap(r1,c1,r2,c2){
  processing = true;
  const a = grid[r1][c1], b = grid[r2][c2];
  await animateSwap(a.el,b.el);
  swapData(a,b);
  const matches = findAllMatches();
  if(matches.length){
    moves--; updateHUD();
    await resolveMatches(matches);
    processing = false;
    deselect();
    checkEndConditions();
  } else {
    // revert swap with a short animation
    await delay(180);
    await animateSwap(a.el,b.el);
    swapData(a,b); // swap back
    processing = false;
    deselect();
  }
}

/* animate swapping two DOM elements (CSS transform) */
function animateSwap(elA, elB){
  return new Promise(resolve=>{
    const rectA = elA.getBoundingClientRect();
    const rectB = elB.getBoundingClientRect();
    const dx = rectB.left - rectA.left, dy = rectB.top - rectA.top;
    elA.style.transition = 'transform .18s ease';
    elB.style.transition = 'transform .18s ease';
    elA.style.transform = `translate(${dx}px, ${dy}px)`;
    elB.style.transform = `translate(${-dx}px, ${-dy}px)`;
    requestAnimationFrame(()=> {
      setTimeout(()=>{
        elA.style.transition = ''; elB.style.transition = '';
        elA.style.transform = ''; elB.style.transform = '';
        resolve();
      }, 190);
    });
  });
}

/* swap data (grid positions, element attributes) */
function swapData(a,b){
  // swap types & element dataset + DOM order
  const ta = a.type, tb = b.type;
  a.type = tb; b.type = ta;
  a.el.className = `tile type-${a.type}`; b.el.className = `tile type-${b.type}`;
  a.el.dataset.type = a.type; b.el.dataset.type = b.type;
  // grid content is still references to objects; we swapped their .type values
}

/* find matches (returns list of arrays of {r,c}) */
function findAllMatches(){
  const matches = [];
  // horizontal
  for(let r=0;r<ROWS;r++){
    let run = [ {r,c:0} ];
    for(let c=1;c<=COLS;c++){
      if(c<COLS && grid[r][c].type === grid[r][run[0].c].type){
        run.push({r,c});
      } else {
        if(run.length >= MATCH_MIN) matches.push(run.slice());
        run = [{r,c}];
      }
    }
  }
  // vertical
  for(let c=0;c<COLS;c++){
    let run = [{r:0,c}];
    for(let r=1;r<=ROWS;r++){
      if(r<ROWS && grid[r][c].type === grid[run[0].r][c].type){
        run.push({r,c});
      } else {
        if(run.length >= MATCH_MIN) matches.push(run.slice());
        run = [{r,c}];
      }
    }
  }
  // dedupe overlapping tiles into groups - we'll just return full list (may contain overlaps)
  // Combine duplicates into sets of coordinate strings to avoid double-removal in logic later
  return matches;
}

/* resolve matches: mark removing, remove, drop, refill, repeat until no matches */
async function resolveMatches(initialMatches){
  let totalRemoved = 0;
  let matches = initialMatches;
  while(matches.length){
    // make unique set of coords
    const removeSet = new Set();
    matches.forEach(run => run.forEach(pt => removeSet.add(`${pt.r},${pt.c}`)));
    // animate removing
    for(const key of removeSet){
      const [r,c] = key.split(',').map(Number);
      const tile = grid[r][c];
      tile.el.classList.add('removing');
    }
    await delay(280);
    // actually remove tiles (set to null)
    for(const key of removeSet){
      const [r,c] = key.split(',').map(Number);
      const tile = grid[r][c];
      // create new blank element placeholder (we will replace types after drop)
      tile.type = null;
      tile.el.className = 'tile blank';
      tile.el.dataset.type = '';
      totalRemoved++;
    }
    // score
    score += removeSet.size * 10;
    updateHUD();

    // drop tiles
    await dropTiles();
    // refill
    refillTiles();
    // find new matches after cascade
    matches = findAllMatches();
    // small pause for cascade animation
    await delay(180);
  }
  return totalRemoved;
}

/* drop tiles vertically to fill blanks */
function dropTiles(){
  return new Promise(resolve=>{
    // for each column: from bottom to top compact non-null types
    for(let c=0;c<COLS;c++){
      let write = ROWS - 1;
      for(let r=ROWS-1;r>=0;r--){
        if(grid[r][c].type != null){
          if(r !== write){
            // move tile type & update element dataset/class
            grid[write][c].type = grid[r][c].type;
            grid[write][c].el.className = `tile type-${grid[write][c].type}`;
            grid[write][c].el.dataset.type = grid[write][c].type;
            grid[r][c].type = null;
            grid[r][c].el.className = 'tile blank';
            grid[r][c].el.dataset.type = '';
          }
          write--;
        }
      }
    }
    // NOTE: we keep the same DOM elements, only change classes. Add a tiny animation delay.
    setTimeout(()=>resolve(), 150);
  });
}

/* refill empty tiles at top with new random types */
function refillTiles(){
  for(let c=0;c<COLS;c++){
    for(let r=0;r<ROWS;r++){
      if(grid[r][c].type == null){
        const t = rand(TYPES);
        grid[r][c].type = t;
        grid[r][c].el.className = `tile type-${t}`;
        grid[r][c].el.dataset.type = t;
      }
    }
  }
}

/* Remove any accidental initial matches to avoid immediate clears */
async function removeInitialMatches(){
  let matches = findAllMatches();
  while(matches.length){
    // replace one tile in each match with a different type
    for(const run of matches){
      const pick = run[Math.floor(run.length/2)];
      const r = pick.r, c = pick.c;
      grid[r][c].type = (grid[r][c].type + 1) % TYPES;
      grid[r][c].el.className = `tile type-${grid[r][c].type}`;
      grid[r][c].el.dataset.type = grid[r][c].type;
    }
    matches = findAllMatches();
  }
}

/* shuffle board (randomize types) */
function shuffleBoard(){
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    const t = rand(TYPES);
    grid[r][c].type = t;
    grid[r][c].el.className = `tile type-${t}`;
    grid[r][c].el.dataset.type = t;
  }
  // ensure no immediate matches
  removeInitialMatches();
}

/* update HUD */
function updateHUD(){
  scoreEl.textContent = score;
  movesEl.textContent = moves;
}

/* small helper delay */
function delay(ms){ return new Promise(res=>setTimeout(res, ms)); }

/* check end conditions: win = score threshold or moves exhausted */
function checkEndConditions(){
  if(score >= 2000){
    showOverlay(true, `You Win! Score: ${score}`);
  } else if(moves <= 0){
    showOverlay(false, `Out of moves! Score: ${score}`);
  }
}

/* overlay */
function showOverlay(win, message){
  overlayTitle.textContent = win ? 'You Win!' : 'Game Over';
  overlayMsg.textContent = message;
  overlay.classList.remove('hidden');
}

/* restart */
function restart(){
  overlay.classList.add('hidden');
  init();
}

/* wiring up events */
playAgainBtn.addEventListener('click', ()=>{ overlay.classList.add('hidden'); init(); });
shuffBtn.addEventListener('click', ()=>{ if(processing) return; shuffleBoard(); });
restartBtn.addEventListener('click', ()=>{ if(processing) return; init(); });

/* prevent selecting text while tapping */
document.addEventListener('touchmove', e=>{ e.preventDefault(); }, {passive:false});

/* startup */
init();
