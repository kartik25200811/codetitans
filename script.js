'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* ================= Navigation, theme, progress ================= */
function go(id) {
  $$('section.page').forEach(s => s.hidden = s.id !== id);
  $$('nav a').forEach(a => a.classList.toggle('on', a.dataset.p === id));
  $('#nav').classList.remove('open');
  const seen = new Set(store.get('visited', []));
  if (['sorting', 'searching', 'ds', 'practice'].includes(id)) seen.add(id);
  store.set('visited', [...seen]);
  updateProgress();
  if (id === 'dash') renderDash();
  aiPopSync(id);
  scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-p],[data-go]');
  if (t) { e.preventDefault(); go(t.dataset.p || t.dataset.go); }
});
$('#menu').onclick = () => $('#nav').classList.toggle('open');
$('#theme').onclick = () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  store.set('theme', light ? 'light' : 'dark');
};
document.documentElement.dataset.theme = store.get('theme', 'dark');
function updateProgress() {
  const n = store.get('visited', []).length, best = store.get('quizBest2', null);
  $('#pv').textContent = n + ' / 4'; $('#pvbar').style.width = n * 25 + '%';
  $('#pq').textContent = best ? best.score + ' / ' + best.total : '–';
  $('#pqbar').style.width = best ? best.score / best.total * 100 + '%' : '0%';
}
// hero bars
$('.hero-bars').innerHTML = Array.from({ length: 14 }, (_, i) =>
  `<i style="height:${30 + (i * 37) % 70}%;animation-delay:${i * 0.15}s"></i>`).join('');

/* ================= Generic step player =================
   One timer at a time: every control clears the pending timeout first,
   so animation loops can never stack. */
function makePlayer(render, speedEl, onState) {
  let steps = [], i = 0, t = null, on = false;
  const set = v => { on = v; onState(v); };
  const show = () => steps.length && render(steps[i], i, steps.length);
  const tick = () => {
    if (!on) return;
    if (i >= steps.length - 1) { set(false); return; }
    i++; show(); t = setTimeout(tick, 1100 - speedEl.value * 100);
  };
  return {
    load(s) { clearTimeout(t); set(false); steps = s; i = 0; show(); },
    toggle() {
      if (!steps.length) return;
      clearTimeout(t);
      if (on) { set(false); return; }
      if (i >= steps.length - 1) { i = 0; show(); }
      set(true); t = setTimeout(tick, 250);
    },
    next() { clearTimeout(t); set(false); if (i < steps.length - 1) { i++; show(); } },
    prev() { clearTimeout(t); set(false); if (i > 0) { i--; show(); } },
    reset() { clearTimeout(t); set(false); i = 0; show(); }
  };
}

/* ================= Sorting: algorithm logic (no DOM) =================
   Each algorithm sorts a copy and records a snapshot per step. */
function sortSteps(name, input, desc) {
  const a = [...input], n = a.length, steps = [], sorted = new Set();
  let c = 0, s = 0;
  const snap = (cmp = [], swp = [], text = '') =>
    steps.push({ a: [...a], cmp, swp, sorted: [...sorted], text, c, s });
  const before = (x, y) => desc ? x > y : x < y;  // x should come before y
  const compare = (i, j) => { c++; snap([i, j], [], `Compare ${a[i]} (index ${i}) with ${a[j]} (index ${j}).`); };
  const swap = (i, j) => { [a[i], a[j]] = [a[j], a[i]]; s++; snap([], [i, j], `Swap: ${a[j]} and ${a[i]} trade places.`); };
  snap([], [], 'Initial array. Press Play or Next to begin.');

  if (name === 'bubble') {
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < n - i - 1; j++) { compare(j, j + 1); if (before(a[j + 1], a[j])) swap(j, j + 1); }
      sorted.add(n - 1 - i);
    }
  } else if (name === 'selection') {
    for (let i = 0; i < n - 1; i++) {
      let m = i;
      for (let j = i + 1; j < n; j++) { compare(j, m); if (before(a[j], a[m])) m = j; }
      if (m !== i) swap(i, m);
      sorted.add(i);
    }
  } else if (name === 'insertion') {
    for (let i = 1; i < n; i++) {
      for (let j = i; j > 0; j--) {
        compare(j - 1, j);
        if (before(a[j], a[j - 1])) swap(j, j - 1); else break;
      }
    }
  } else if (name === 'merge') {
    const ms = (l, r) => {
      if (l >= r) return;
      const m = (l + r) >> 1; ms(l, m); ms(m + 1, r);
      const L = a.slice(l, m + 1), R = a.slice(m + 1, r + 1);
      let i = 0, j = 0, k = l;
      while (i < L.length && j < R.length) {
        c++; snap([l + i, m + 1 + j], [], `Merging: compare ${L[i]} (left half) with ${R[j]} (right half).`);
        a[k] = before(R[j], L[i]) ? R[j++] : L[i++]; s++;
        snap([], [k], `Place ${a[k]} at index ${k}.`); k++;
      }
      while (i < L.length) { a[k] = L[i++]; s++; snap([], [k], `Copy leftover ${a[k]} to index ${k}.`); k++; }
      while (j < R.length) { a[k] = R[j++]; s++; snap([], [k], `Copy leftover ${a[k]} to index ${k}.`); k++; }
    };
    ms(0, n - 1);
  } else if (name === 'quick') {
    const qs = (l, r) => {
      if (l > r) return;
      if (l === r) { sorted.add(l); return; }
      const pivot = a[r]; let i = l;
      snap([], [], `Choose pivot ${pivot} (last element of this range).`);
      for (let j = l; j < r; j++) { compare(j, r); if (before(a[j], pivot)) { if (i !== j) swap(i, j); i++; } }
      if (i !== r) swap(i, r);
      sorted.add(i);
      snap([], [], `Pivot ${a[i]} is now in its final position (index ${i}).`);
      qs(l, i - 1); qs(i + 1, r);
    };
    qs(0, n - 1);
  } else if (name === 'heap') {
    // asc uses a max-heap, desc a min-heap (via `before`)
    const heapify = (size, i) => {
      let top = i; const l = 2 * i + 1, r = l + 1;
      if (l < size) { compare(l, top); if (before(a[top], a[l])) top = l; }
      if (r < size) { compare(r, top); if (before(a[top], a[r])) top = r; }
      if (top !== i) { swap(i, top); heapify(size, top); }
    };
    for (let i = (n >> 1) - 1; i >= 0; i--) heapify(n, i);
    snap([], [], 'Heap built: the root holds the extreme value.');
    for (let i = n - 1; i > 0; i--) { swap(0, i); sorted.add(i); heapify(i, 0); }
    sorted.add(0);
  } else if (name === 'counting') {
    const mn = Math.min(...a), mx = Math.max(...a), cnt = new Array(mx - mn + 1).fill(0);
    for (let i = 0; i < n; i++) { cnt[a[i] - mn]++; c++; snap([i], [], `Count value ${a[i]}.`); }
    const order = [...cnt.keys()]; if (desc) order.reverse();
    let k = 0;
    for (const v of order) while (cnt[v]-- > 0) { a[k] = v + mn; s++; snap([], [k], `Write ${a[k]} at index ${k}.`); sorted.add(k); k++; }
  }
  for (let i = 0; i < n; i++) sorted.add(i);
  snap([], [], 'Done! The array is sorted.');
  return steps;
}

const CX = {
  bubble: ['Bubble Sort', 'O(n)', 'O(n²)', 'O(n²)', 'O(1)', 'Repeatedly swaps adjacent out-of-order pairs; the largest value "bubbles" to the end each pass.'],
  selection: ['Selection Sort', 'O(n²)', 'O(n²)', 'O(n²)', 'O(1)', 'Finds the smallest remaining value and places it at the front.'],
  insertion: ['Insertion Sort', 'O(n)', 'O(n²)', 'O(n²)', 'O(1)', 'Grows a sorted prefix by sliding each new value left into place, like sorting playing cards.'],
  merge: ['Merge Sort', 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(n)', 'Splits the array in half, sorts each half, then merges them.'],
  quick: ['Quick Sort', 'O(n log n)', 'O(n log n)', 'O(n²)', 'O(log n)', 'Picks a pivot, moves smaller values before it, then recurses on both sides.'],
  heap: ['Heap Sort', 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(1)', 'Builds a heap, then repeatedly moves the root to the end.'],
  counting: ['Counting Sort', 'O(n + k)', 'O(n + k)', 'O(n + k)', 'O(k)', 'Counts how often each value appears, then rewrites the array in order (k = value range).']
};
const cxTable = (r, extra = '') =>
  `<tr><th>Best</th><th>Average</th><th>Worst</th><th>Space</th></tr><tr><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>${extra}`;

/* ================= Sorting: UI ================= */
let sortInput = [];
const sortPlayer = makePlayer((st, i, n) => {
  const max = Math.max(...st.a, 1);
  $('#s-bars').classList.toggle('many', st.a.length > 20);
  $('#s-bars').innerHTML = st.a.map((v, k) => {
    const cls = st.swp.includes(k) ? 'swp' : st.cmp.includes(k) ? 'cmp' : st.sorted.includes(k) ? 'sorted' : '';
    return `<div class="bar ${cls}" style="height:${v / max * 92}%;--i:${k}"><span>${v}</span></div>`;
  }).join('');
  $('#s-text').textContent = st.text;
  $('#s-stats').textContent = `Step ${i + 1} of ${n} · Comparisons: ${st.c} · Swaps/writes: ${st.s}`;
}, $('#s-speed'), on => $('#s-play').textContent = on ? '⏸ Pause' : '▶ Play');

function loadSort() {
  const k = $('#s-algo').value, r = CX[k];
  $('#s-name').textContent = r[0]; $('#s-desc').textContent = r[5]; $('#s-cx').innerHTML = cxTable(r); $('#s-pseudo').textContent = PSEUDO[k];
  sortPlayer.load(sortSteps(k, sortInput, $('#s-order').value === 'desc'));
}
function randomArray() {
  sortInput = Array.from({ length: +$('#s-size').value }, () => 5 + Math.floor(Math.random() * 95));
  loadSort();
}
$('#s-rand').onclick = randomArray;
$('#s-size').oninput = randomArray;
$('#s-algo').onchange = $('#s-order').onchange = loadSort;
$('#s-apply').onclick = () => {
  const nums = $('#s-custom').value.split(/[\s,]+/).filter(Boolean).map(Number);
  if (!nums.length || nums.length > 60 || nums.some(x => !Number.isInteger(x) || x < 1 || x > 999)) {
    $('#s-text').textContent = 'Please enter 1–60 whole numbers between 1 and 999, separated by commas.'; return;
  }
  sortInput = nums; loadSort();
};
$('#s-play').onclick = () => sortPlayer.toggle();
$('#s-next').onclick = () => sortPlayer.next();
$('#s-prev').onclick = () => sortPlayer.prev();
$('#s-reset').onclick = () => sortPlayer.reset();

/* ================= Searching ================= */
function searchSteps(kind, input, target) {
  let a = [...input], c = 0; const steps = [];
  const add = (cur, lo, hi, text, found = false) => steps.push({ a: [...a], cur, lo, hi, text, found, c, t: target, kind });
  add(-1, 0, a.length - 1, `Looking for ${target} using ${kind} search.`);
  if (kind === 'binary' && a.some((v, i) => i && a[i - 1] > v)) {
    a.sort((x, y) => x - y);
    add(-1, 0, a.length - 1, 'Binary search requires a sorted array, so the array was sorted first.');
  }
  if (kind === 'linear') {
    for (let i = 0; i < a.length; i++) {
      c++;
      if (a[i] === target) { add(i, 0, a.length - 1, `Index ${i}: ${a[i]} equals ${target}. Found!`, true); return steps; }
      add(i, 0, a.length - 1, `Index ${i}: ${a[i]} is not ${target}. Move on.`);
    }
  } else {
    let lo = 0, hi = a.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1; c++;
      if (a[mid] === target) { add(mid, lo, hi, `Middle index ${mid} holds ${a[mid]}. Found!`, true); return steps; }
      if (a[mid] < target) { add(mid, lo, hi, `${a[mid]} < ${target}: discard the left half (indices ${lo}–${mid}).`); lo = mid + 1; }
      else { add(mid, lo, hi, `${a[mid]} > ${target}: discard the right half (indices ${mid}–${hi}).`); hi = mid - 1; }
    }
    add(-1, 1, 0, 'Search range is empty.');
  }
  add(-1, 0, -1, `${target} is not in the array.`);
  return steps;
}
const searchPlayer = makePlayer((st, i, n) => {
  const qc = $('#q-cells');
  let cells = [...qc.querySelectorAll('.cell')];
  // Rebuild cells only when the values change; otherwise update classes so CSS transitions can run
  if (cells.length !== st.a.length || cells.some((c, k) => +c.dataset.v !== st.a[k])) {
    cells.forEach(c => c.remove());
    qc.insertAdjacentHTML('beforeend', st.a.map((v, k) => `<div class="cell" data-v="${v}"><span class="tg"></span>${v}<small>[${k}]</small></div>`).join(''));
    cells = [...qc.querySelectorAll('.cell')];
  }
  const empty = st.hi < st.lo, bin = st.kind === 'binary';
  cells.forEach((c, k) => {
    const out = empty || k < st.lo || k > st.hi;
    c.className = 'cell' + (st.found && k === st.cur ? ' sorted' : k === st.cur ? ' cmp' : '') + (out ? ' elim' : '') +
      (!bin && st.cur > k && !st.found ? ' seen' : '');
    const tags = bin ? [!empty && k === st.lo ? 'lo' : '', k === st.cur ? 'mid' : '', !empty && k === st.hi ? 'hi' : ''] : [k === st.cur ? 'i' : ''];
    c.querySelector('.tg').textContent = tags.filter(Boolean).join(' · ');
  });
  // Comparison banner
  let cls = '', msg = `Target: ${st.t}`;
  if (st.cur >= 0) {
    const v = st.a[st.cur];
    if (v === st.t) { cls = 'eq'; msg = `${v} = ${st.t}  ✔ Match!`; }
    else if (!bin) { cls = 'gt'; msg = `${v} ≠ ${st.t}  → not a match, check the next one`; }
    else if (v < st.t) { cls = 'lt'; msg = `${v} < ${st.t}  → too small, search the right half`; }
    else { cls = 'gt'; msg = `${v} > ${st.t}  → too big, search the left half`; }
  } else if (empty) { cls = 'no'; msg = `✖ ${st.t} was not found`; }
  const cmp = $('#q-cmp'); cmp.className = 'qcmp ' + cls; cmp.textContent = msg;
  $('#q-text').textContent = st.text;
  $('#q-stats').textContent = `Step ${i + 1} of ${n} · Comparisons: ${st.c} · Current index: ${st.cur < 0 ? '–' : st.cur}`;
}, $('#q-speed'), on => $('#q-play').textContent = on ? '⏸ Pause' : '▶ Play');
function loadSearch() {
  const nums = $('#q-arr').value.split(/[\s,]+/).filter(Boolean).map(Number), t = Number($('#q-target').value);
  if (!nums.length || nums.length > 30 || nums.some(isNaN) || $('#q-target').value === '') {
    $('#q-text').textContent = 'Enter up to 30 numbers and a target value.'; return;
  }
  const k = $('#q-algo').value;
  $('#q-cx').innerHTML = k === 'linear'
    ? cxTable(['', 'O(1)', 'O(n)', 'O(n)', 'O(1)']) : cxTable(['', 'O(1)', 'O(log n)', 'O(log n)', 'O(1)']);
  $('#q-pseudo').textContent = PSEUDO[k];
  searchPlayer.load(searchSteps(k, nums, t));
}
$('#q-start').onclick = loadSearch;
$('#q-algo').onchange = loadSearch;
$('#q-play').onclick = () => searchPlayer.toggle();
$('#q-next').onclick = () => searchPlayer.next();
$('#q-reset').onclick = () => searchPlayer.reset();

/* ================= Data structures: tabs ================= */
$$('.tabs button').forEach(b => b.onclick = () => {
  const sec = b.closest('section');
  sec.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  sec.querySelectorAll('.tab').forEach(t => t.hidden = t.id !== b.dataset.t);
});

/* ================= Linked list ================= */
let ll = [10, 20, 30], llBusy = false;
const llType = () => $('#ll-type').value;
const llSay = t => $('#ll-text').textContent = t;
function renderLL(hi = -1, mode = '') {
  const type = llType();
  if (!ll.length) { $('#ll').innerHTML = '<span class="muted">List is empty (head = null)</span>'; return; }
  $('#ll').innerHTML = ll.map((v, i) =>
    `<div class="node ${i === hi ? mode : ''}">${i === 0 ? '<em>head</em>' : ''}${i === ll.length - 1 ? '<em class="tail">tail</em>' : ''}
     <div class="box">${type === 'doubly' ? '<i>prev</i>' : ''}<b>${v}</b><i>next</i></div></div>` +
    (i < ll.length - 1 ? `<span class="arrow">${type === 'doubly' ? '⇄' : '→'}</span>` : '')).join('') +
    `<span class="arrow">${type === 'circular' ? '↩ back to head' : '→ null'}</span>`;
}
async function llOp(op) {
  if (llBusy) return;
  const raw = $('#ll-val').value, v = Number(raw), pos = Number($('#ll-pos').value);
  const needVal = ['insHead', 'insTail', 'insAt', 'search'].includes(op);
  const needPos = ['insAt', 'delAt'].includes(op);
  if (needVal && raw === '') return llSay('Please enter a value first.');
  if (needPos && (!Number.isInteger(pos) || $('#ll-pos').value === '')) return llSay('Please enter a whole-number position.');
  if (op.startsWith('del') && !ll.length) return llSay('Underflow: the list is empty, nothing to delete.');
  if (op === 'insAt' && (pos < 0 || pos > ll.length)) return llSay(`Position must be between 0 and ${ll.length}.`);
  if (op === 'delAt' && (pos < 0 || pos >= ll.length)) return llSay(`Position must be between 0 and ${ll.length - 1}.`);
  llBusy = true;
  try {
    if (op === 'insHead') { ll.unshift(v); renderLL(0, 'new'); llSay(`New node ${v} points to the old head, then head moves to it. O(1).`); }
    else if (op === 'insTail') { ll.push(v); renderLL(ll.length - 1, 'new'); llSay(`The old tail's next now points to ${v}. With a tail pointer this is O(1); without one you must traverse, O(n).`); }
    else if (op === 'insAt') { ll.splice(pos, 0, v); renderLL(pos, 'new'); llSay(`Walked to position ${pos - 1}, then relinked pointers to insert ${v}. O(n).`); }
    else if (op === 'search' || op === 'traverse') {
      for (let i = 0; i < ll.length; i++) {
        renderLL(i, 'cur'); llSay(op === 'search' ? `Visiting node ${i}: is ${ll[i]} equal to ${v}?` : `Visiting node ${i} (value ${ll[i]}).`);
        await sleep(650);
        if (op === 'search' && ll[i] === v) { renderLL(i, 'hit'); llSay(`Found ${v} at position ${i}. O(n) worst case.`); return; }
      }
      renderLL(); llSay(op === 'search' ? `${v} is not in the list.` : 'Traversal finished. O(n).');
    } else {
      const i = op === 'delHead' ? 0 : op === 'delTail' ? ll.length - 1 : pos;
      renderLL(i, 'del'); llSay(`Unlinking node ${ll[i]} and bypassing it with neighbour pointers.`);
      await sleep(650); const gone = ll.splice(i, 1)[0]; renderLL();
      llSay(`Deleted ${gone}. Head/delete-at-head is O(1); tail and position need traversal, O(n).`);
    }
  } finally { llBusy = false; }
}
$$('[data-ll]').forEach(b => b.onclick = () => llOp(b.dataset.ll));
$('#ll-type').onchange = () => { renderLL(); llSay(`${llType()} list selected.`); };
renderLL();

/* ================= Stack (array based, capacity 8) ================= */
const CAP = 8; let stack = [], stBusy = false;
const stSay = t => $('#st-text').textContent = t;
function renderStack(anim = '') {
  $('#st').innerHTML = stack.map((v, i) =>
    `<div class="item ${i === stack.length - 1 ? anim : ''}">${v}${i === stack.length - 1 ? '<span class="tag">← TOP</span>' : ''}</div>`).join('') ||
    '<span class="muted">Empty (top = -1)</span>';
}
$('#st-push').onclick = () => {
  const raw = $('#st-val').value;
  if (raw === '') return stSay('Enter a value to push.');
  if (stack.length >= CAP) return stSay('Overflow: the stack is full (8 items).');
  stack.push(Number(raw)); renderStack('enter'); stSay(`Pushed ${raw}. TOP is now index ${stack.length - 1}. Size: ${stack.length}.`);
};
$('#st-pop').onclick = async () => {
  if (stBusy) return;
  if (!stack.length) return stSay('Underflow: the stack is empty.');
  stBusy = true; renderStack('leave'); await sleep(380);
  const v = stack.pop(); renderStack(); stBusy = false;
  stSay(`Popped ${v}: the most recently added item leaves first (LIFO). Size: ${stack.length}.`);
};
$('#st-peek').onclick = () => stSay(stack.length ? `Peek: TOP is ${stack[stack.length - 1]} (not removed).` : 'Nothing to peek: the stack is empty.');
$('#st-clear').onclick = () => { stack = []; renderStack(); stSay('Stack cleared.'); };
renderStack();

/* ================= Queue (array based, capacity 8) ================= */
let queue = [], quBusy = false;
const quSay = t => $('#qu-text').textContent = t;
function renderQueue(anim = '', at = -1) {
  $('#qu').innerHTML = queue.map((v, i) =>
    `<div class="qitem ${i === at ? anim : ''}"><span class="tag">${[i === 0 ? 'FRONT' : '', i === queue.length - 1 ? 'REAR' : ''].filter(Boolean).join(' / ')}</span>${v}</div>`).join('') ||
    '<span class="muted">Empty (front = rear = -1)</span>';
}
$('#qu-enq').onclick = () => {
  const raw = $('#qu-val').value;
  if (raw === '') return quSay('Enter a value to enqueue.');
  if (queue.length >= CAP) return quSay('Overflow: the queue is full (8 items).');
  queue.push(Number(raw)); renderQueue('enter', queue.length - 1); quSay(`Enqueued ${raw} at the rear. Size: ${queue.length}.`);
};
$('#qu-deq').onclick = async () => {
  if (quBusy) return;
  if (!queue.length) return quSay('Underflow: the queue is empty.');
  quBusy = true; renderQueue('leave', 0); await sleep(380);
  const v = queue.shift(); renderQueue(); quBusy = false;
  quSay(`Dequeued ${v} from the front: first in, first out (FIFO). Size: ${queue.length}.`);
};
$('#qu-front').onclick = () => quSay(queue.length ? `Front is ${queue[0]}.` : 'The queue is empty.');
$('#qu-rear').onclick = () => quSay(queue.length ? `Rear is ${queue[queue.length - 1]}.` : 'The queue is empty.');
$('#qu-clear').onclick = () => { queue = []; renderQueue(); quSay('Queue cleared.'); };
renderQueue();

/* ================= Learn: complexity reference ================= */
$('#ref').innerHTML = '<tr><th>Algorithm</th><th>Best</th><th>Average</th><th>Worst</th><th>Space</th></tr>' +
  Object.values(CX).map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join('') +
  '<tr><td>Linear Search</td><td>O(1)</td><td>O(n)</td><td>O(n)</td><td>O(1)</td></tr><tr><td>Binary Search</td><td>O(1)</td><td>O(log n)</td><td>O(log n)</td><td>O(1)</td></tr>';

/* ================= Quiz challenge =================
   A bank of questions tagged by topic. Each attempt draws QUIZ_N random questions
   and shuffles the answer order, so retakes feel different. */
const QUIZ_BANK = [
  { t: 'Data Structures', q: 'Which structure follows LIFO?', o: ['Queue', 'Stack', 'Array', 'Heap'], a: 1, e: 'A stack removes the most recently added item first.' },
  { t: 'Sorting', q: 'Worst-case time of Bubble Sort?', o: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'], a: 2, e: 'Two nested loops over n items give O(n²).' },
  { t: 'Searching', q: 'Binary search requires the array to be…', o: ['Unique', 'Sorted', 'Even length', 'Positive'], a: 1, e: 'It discards half the range by comparing with the middle, which only works on sorted data.' },
  { t: 'Sorting', q: 'Which sort splits the array in halves and merges them?', o: ['Quick Sort', 'Heap Sort', 'Merge Sort', 'Selection Sort'], a: 2, e: 'Merge sort divides, sorts each half, then merges.' },
  { t: 'Data Structures', q: 'In a queue, items are removed from the…', o: ['Rear', 'Front', 'Middle', 'Top'], a: 1, e: 'FIFO: the oldest item sits at the front.' },
  { t: 'Data Structures', q: 'Inserting at the head of a linked list costs…', o: ['O(1)', 'O(n)', 'O(log n)', 'O(n²)'], a: 0, e: 'Only the new node and the head pointer change.' },
  { t: 'Sorting', q: 'Which sort is built on a heap?', o: ['Heap Sort', 'Counting Sort', 'Insertion Sort', 'Bubble Sort'], a: 0, e: 'Heap sort repeatedly extracts the root of a heap.' },
  { t: 'Sorting', q: 'Quick Sort worst case happens when…', o: ['Array is random', 'Pivot is always the min or max', 'Array is tiny', 'Values repeat once'], a: 1, e: 'Unbalanced partitions make the recursion depth n, giving O(n²).' },
  { t: 'Trees', q: 'Which traversal of a BST visits the values in sorted order?', o: ['Preorder', 'Postorder', 'Inorder', 'Level order'], a: 2, e: 'Inorder visits left subtree, node, right subtree, which is ascending order in a BST.' },
  { t: 'Graphs', q: 'Which data structure does BFS use?', o: ['Stack', 'Queue', 'Heap', 'Hash table'], a: 1, e: 'A queue (FIFO) makes BFS explore the graph level by level.' },
  { t: 'Graphs', q: 'DFS is naturally implemented with…', o: ['A queue', 'A sorted array', 'A stack or recursion', 'A counting array'], a: 2, e: 'DFS goes deep first and backtracks, which is exactly what a stack (or the call stack) does.' },
  { t: 'Searching', q: 'After each step of binary search, how much of the range remains?', o: ['All of it', 'About half', 'One element', 'Two thirds'], a: 1, e: 'Comparing with the middle lets you discard one half, so the range halves every step: O(log n).' },
  { t: 'Sorting', q: 'Merge Sort needs how much extra space?', o: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], a: 2, e: 'The merge step copies halves into temporary arrays, using O(n) extra space.' },
  { t: 'Sorting', q: 'Which simple sort is fastest on an almost-sorted array?', o: ['Selection Sort', 'Insertion Sort', 'Heap Sort', 'Counting Sort'], a: 1, e: 'Insertion sort does very little work when items are already close to their place: O(n) best case.' },
  { t: 'Sorting', q: 'Counting Sort works best when…', o: ['Values are huge and sparse', 'The range of values (k) is small', 'The array is already sorted', 'Items are strings only'], a: 1, e: 'Its cost is O(n + k), so a small value range keeps it fast.' },
  { t: 'Data Structures', q: 'Pushing onto a full array-based stack causes…', o: ['Underflow', 'Overflow', 'A rotation', 'Nothing'], a: 1, e: 'Overflow means adding to a structure that has no free space left.' },
  { t: 'Trees', q: 'When is BST search O(n) instead of O(log n)?', o: ['When it has duplicates', 'When it degenerates into a chain', 'When it is complete', 'When values are negative'], a: 1, e: 'Inserting sorted values (1, 2, 3, 4…) makes every node have one child, so the tree behaves like a list.' },
  { t: 'Graphs', q: 'Time complexity of BFS or DFS on a graph?', o: ['O(V)', 'O(E)', 'O(V + E)', 'O(V × E)'], a: 2, e: 'Each vertex and each edge is processed a constant number of times.' },
  { t: 'Sorting', q: 'Which sort guarantees O(n log n) time AND uses O(1) extra space?', o: ['Merge Sort', 'Heap Sort', 'Counting Sort', 'Bubble Sort'], a: 1, e: 'Heap sort works in place and never degrades beyond O(n log n).' },
  { t: 'Data Structures', q: 'Deleting the tail of a singly linked list is O(n) because…', o: ['Memory must be freed slowly', 'You must walk to the node before the tail', 'The list must be sorted first', 'The head pointer is lost'], a: 1, e: 'Nodes only point forward, so you traverse to the second-to-last node to set its next to null.' },
  { t: 'Big-O', q: 'Which of these grows the fastest as n increases?', o: ['O(log n)', 'O(n)', 'O(n log n)', 'O(n²)'], a: 3, e: 'Quadratic growth overtakes the others quickly as n gets larger.' },
  { t: 'Big-O', q: 'Reading an array element by its index is…', o: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], a: 0, e: 'The address is computed directly, so the cost does not depend on array size.' },
  { t: 'Trees', q: 'In postorder traversal, the root is visited…', o: ['First', 'Between the subtrees', 'Last', 'Never'], a: 2, e: 'Postorder is left, right, then the node itself.' },
  { t: 'Graphs', q: 'BFS finds the shortest path (fewest edges) in…', o: ['Weighted graphs only', 'Unweighted graphs', 'Trees only', 'Sorted graphs'], a: 1, e: 'Exploring level by level reaches every node using the minimum number of edges.' },
  { t: 'Searching', q: 'Worst-case time of linear search?', o: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], a: 2, e: 'If the target is last or missing, every element is checked.' }
];
const QUIZ_N = 10;
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function newQuiz() {
  return shuffle(QUIZ_BANK).slice(0, QUIZ_N).map(q => {
    const opts = shuffle(q.o.map((t, i) => ({ t, ok: i === q.a })));
    return { ...q, opts, a: opts.findIndex(o => o.ok) };
  });
}
let QUIZ = newQuiz(), qi = 0, score = 0, answered = false, qlog = [];

function finishQuiz(box) {
  const total = QUIZ.length;
  // history + per-topic stats + missed questions, all feeding the Student Dashboard
  const hist = store.get('quizHist', []); hist.push({ d: Date.now(), score, total }); store.set('quizHist', hist.slice(-20));
  const topics = store.get('quizTopics', {});
  qlog.forEach(r => { const x = topics[r.t] = topics[r.t] || { c: 0, t: 0 }; x.t++; if (r.ok) x.c++; });
  store.set('quizTopics', topics);
  let missed = store.get('quizMissed', []);
  qlog.forEach(r => { missed = missed.filter(m => m.q !== r.q); if (!r.ok) missed.unshift({ q: r.q, ans: r.ans, e: r.e, t: r.t }); });
  store.set('quizMissed', missed.slice(0, 10));
  const best = store.get('quizBest2', null);
  if (!best || score / total > best.score / best.total) store.set('quizBest2', { score, total });
  updateProgress();
  const wrong = qlog.filter(r => !r.ok);
  box.innerHTML = `<h3>Finished! Score: ${score} / ${total}</h3><p class="muted">Best: ${store.get('quizBest2').score} / ${store.get('quizBest2').total}</p>` +
    (wrong.length ? '<h4>Review your mistakes</h4>' + wrong.map(r => `<div class="miss"><p><b>${escHtml(r.q)}</b></p><p>Answer: ${escHtml(r.ans)}</p><p class="muted">${escHtml(r.e)}</p></div>`).join('') : '<p class="say">🎉 Perfect score!</p>') +
    '<div class="row"><button class="btn primary" id="qz-again">Try again (new questions)</button><button class="btn" data-go="dash">View dashboard</button></div>';
  $('#qz-again').onclick = () => { QUIZ = newQuiz(); qi = 0; score = 0; qlog = []; renderQuiz(); };
}
function renderQuiz() {
  const box = $('#quiz');
  if (qi >= QUIZ.length) return finishQuiz(box);
  const q = QUIZ[qi]; answered = false;
  box.innerHTML = `<div class="meter"><i style="width:${qi / QUIZ.length * 100}%"></i></div><p class="muted">Question ${qi + 1} of ${QUIZ.length} · <span class="badge">${q.t}</span> · Score ${score}</p><h3>${escHtml(q.q)}</h3>` +
    q.opts.map((o, i) => `<button class="opt" data-i="${i}">${escHtml(o.t)}</button>`).join('') + '<p id="qz-fb" class="say"></p><button class="btn primary" id="qz-next" hidden>Next</button>';
  $$('#quiz .opt').forEach(b => b.onclick = () => {
    if (answered) return; answered = true;
    const pick = +b.dataset.i, ok = pick === q.a; if (ok) score++;
    qlog.push({ t: q.t, q: q.q, ok, ans: q.opts[q.a].t, e: q.e });
    $$('#quiz .opt').forEach((x, i) => x.classList.add(i === q.a ? 'right' : i === pick ? 'wrong' : 'x'));
    $('#qz-fb').textContent = (ok ? 'Correct! ' : 'Not quite. ') + q.e;
    $('#qz-next').hidden = false;
  });
  $('#qz-next').onclick = () => { qi++; renderQuiz(); };
}
renderQuiz();

/* ================= Student dashboard ================= */
const QUIZ_TOPICS = { 'Sorting': 'sorting', 'Searching': 'searching', 'Data Structures': 'ds', 'Trees': 'tg', 'Graphs': 'tg', 'Big-O': 'learn' };
function renderDash() {
  const hist = store.get('quizHist', []), topics = store.get('quizTopics', {}), missed = store.get('quizMissed', []);
  const bs = store.get('bugSave', { unlocked: 0, pts: {} }), best = store.get('quizBest2', null), seen = store.get('visited', []).length;
  const pct = h => Math.round(h.score / h.total * 100);
  const avg = hist.length ? Math.round(hist.reduce((s, h) => s + pct(h), 0) / hist.length) : null;
  const cleared = Object.keys(bs.pts).length, pts = Object.values(bs.pts).reduce((a, b) => a + b, 0);
  const tiles = [
    [seen + ' / 4', 'Visualizers explored', seen / 4],
    [best ? best.score + ' / ' + best.total : '–', 'Best quiz score', best ? best.score / best.total : 0],
    [avg === null ? '–' : avg + '%', `Average quiz score · ${hist.length} attempt${hist.length === 1 ? '' : 's'}`, (avg || 0) / 100],
    [cleared + ' / ' + BUGS.length, `Bug Hunter levels cleared · ${pts} pts`, cleared / BUGS.length]
  ];
  $('#dash-stats').innerHTML = tiles.map(([v, l, m]) =>
    `<div class="card stat"><h3>${v}</h3><p>${l}</p>${m === null ? '' : `<div class="meter"><i style="width:${Math.round(m * 100)}%"></i></div>`}</div>`).join('');

  const rows = Object.keys(QUIZ_TOPICS).map(t => { const x = topics[t]; return { t, x, p: x && x.t ? Math.round(x.c / x.t * 100) : null }; });
  $('#dash-topics').innerHTML = rows.map(r =>
    `<div class="tbar ${r.p === null ? '' : r.p < 60 ? 'weak' : 'good'}"><div class="row"><span>${r.t}</span><span class="muted">${r.p === null ? 'not attempted yet' : `${r.x.c} / ${r.x.t} correct · ${r.p}%`}</span></div><div class="meter"><i style="width:${r.p || 0}%"></i></div></div>`).join('');
  const weak = rows.filter(r => r.p !== null).sort((a, b) => a.p - b.p)[0];
  if (weak && weak.p < 80) $('#dash-topics').insertAdjacentHTML('beforeend',
    `<div class="focus">🎯 Focus next: <b>${weak.t}</b> (${weak.p}%). <a href="#" data-go="${QUIZ_TOPICS[weak.t]}">Revisit this topic</a></div>`);

  $('#dash-hist').innerHTML = hist.length
    ? '<table class="mini"><tr><th>Date</th><th>Score</th><th>Percent</th></tr>' + hist.slice(-5).reverse().map(h =>
        `<tr><td>${new Date(h.d).toLocaleDateString()}</td><td>${h.score} / ${h.total}</td><td>${pct(h)}%</td></tr>`).join('') + '</table>'
    : '<p class="muted">No quiz attempts yet. Finish a quiz and your results will show up here.</p>';

  $('#dash-missed').innerHTML = missed.length
    ? missed.map(m => `<div class="miss"><p><b>${escHtml(m.q)}</b> <span class="badge">${escHtml(m.t)}</span></p><p>Answer: ${escHtml(m.ans)}</p><p class="muted">${escHtml(m.e)}</p></div>`).join('')
    : '<p class="muted">Nothing to review. Questions you miss in the quiz appear here until you answer them correctly.</p>';

  $('#dash-name').value = store.get('student', ''); dashHello();
}
function dashHello() {
  const n = String(store.get('student', '')).trim();
  $('#dash-hello').textContent = n ? `Welcome back, ${n}! 👋` : '';
}
$('#dash-name').addEventListener('input', e => { store.set('student', e.target.value); dashHello(); });
$('#dash-reset').onclick = () => {
  if (!confirm('Reset your quiz history and visualizer progress? Your Bug Hunter progress is kept.')) return;
  ['visited', 'quizBest2', 'quizHist', 'quizTopics', 'quizMissed'].forEach(k => { try { localStorage.removeItem(k); } catch {} });
  updateProgress(); renderDash();
};

/* ================= AI assistant: OpenAI + built-in answers + live web search =================
   Answer order for each message:
     1) "search: ..." forces a Wikipedia web search.
     2) If OpenAI is connected and switched on, ask OpenAI (with the recent conversation as context).
     3) Otherwise (or if OpenAI fails) use the built-in answers, then the Wikipedia search API.
   Two ways to connect OpenAI (never put a real key in this file, anyone could read it):
     A) PROXY (recommended for a public site): deploy openai-proxy-worker.js and set AI_CONFIG.proxyUrl.
        The key lives on the server, visitors need nothing.
     B) OWN KEY: leave proxyUrl empty; each visitor pastes their own key in "AI settings".
        It is stored only in that browser's localStorage and sent only to api.openai.com.
   One conversation is shared by every assistant widget (Home, AI page, pop-up). */
const AI_CONFIG = {
  proxyUrl: '',                 // e.g. 'https://algolab-ai.YOURNAME.workers.dev'  (leave '' to use visitors' own keys)
  defaultModel: 'gpt-4o-mini'   // editable per visitor in AI settings when using their own key
};
const AI_SYSTEM = 'You are the AlgoLab assistant, a friendly tutor for beginners learning data structures and algorithms. ' +
  'Be accurate and concise (under 150 words unless asked for more). Use plain text, with triple-backtick code fences for code and no other Markdown. ' +
  'AlgoLab has visualizers for sorting, searching, linked lists, stacks, queues, trees and graphs (BFS/DFS), plus a Bug Hunter game, a quiz and a student dashboard; point to them when helpful. ' +
  'If a question is unrelated to computer science or programming, politely steer back to DSA.';

const DEMO = [
  [/bubble/, 'Bubble sort compares neighbouring items and swaps them if they are out of order. After each pass the largest remaining value sits at the end. Worst case O(n²).'],
  [/binary/, 'Binary search checks the middle of a sorted array and throws away the half that cannot contain the target. That is O(log n).'],
  [/stack|queue|lifo|fifo/, 'A stack is LIFO (last in, first out), like a pile of plates. A queue is FIFO (first in, first out), like a line at a counter.'],
  [/linked/, 'A linked list stores nodes that each point to the next one. Inserting at the head is O(1), but reaching position k needs O(k) steps.'],
  [/merge|quick|compare/, 'Merge sort is always O(n log n) but needs O(n) extra space. Quick sort is usually faster in practice and in-place, but its worst case is O(n²).'],
  [/practice|question/, 'Practice: 1) Sort [4, 2, 7, 1] with insertion sort by hand. 2) How many comparisons does binary search need for 1000 items? (about 10)'],
  [/big.?o|complexity/, 'Big-O describes how running time grows as input size n grows. O(1) is constant, O(log n) grows slowly, O(n²) explodes quickly.']
];
const SUGG = ['Explain bubble sort', 'Binary search vs linear', 'Stack vs queue', 'What is a hash table?', 'search: dijkstra algorithm'];
const WEB_KEY = 'aiWebSearch';
const chatLog = [], chatViews = [];
let chatBusy = false;

/* ---- OpenAI settings (kept in localStorage, never in this file) ---- */
const aiCfg = () => ({ key: store.get('openaiKey', ''), model: (store.get('openaiModel', '') || '').trim() || AI_CONFIG.defaultModel, on: store.get('openaiOn', true) });
const aiReady = () => !!AI_CONFIG.proxyUrl || !!aiCfg().key;
const aiOn = () => aiReady() && aiCfg().on;
function syncAI() {
  const c = aiCfg();
  const state = !aiReady() ? 'not connected' : c.on ? 'on · ' + (AI_CONFIG.proxyUrl ? 'secure server' : c.model) : 'off';
  chatViews.forEach(v => {
    v.state.textContent = state; v.use.checked = c.on; v.use.disabled = !aiReady();
    v.model.value = store.get('openaiModel', ''); v.model.placeholder = 'Model (default ' + AI_CONFIG.defaultModel + ')';
    v.key.value = ''; v.key.placeholder = c.key ? `Key saved (…${c.key.slice(-4)}). Paste a new one to replace it` : 'sk-…';
  });
  const badge = $('#ai-badge'); if (badge) badge.textContent = aiOn() ? 'OpenAI on' : 'Web search on';
}
class AIError extends Error { constructor(status, detail) { super('AI error ' + status); this.status = status; this.detail = detail; } }
function aiErrorText(e) {
  const tail = ' Using the built-in answers instead.';
  if (e.status === 401 || e.status === 403) return 'OpenAI rejected the key or the request. Check it in AI settings.' + tail;
  if (e.status === 429) return 'OpenAI reports the rate limit or quota was exceeded (check your billing and credits).' + tail;
  if (e.status === 400 || e.status === 404) return `OpenAI could not use the model "${aiCfg().model}"${e.detail ? ' (' + String(e.detail).slice(0, 120) + ')' : ''}. Change the model in AI settings.` + tail;
  if (e.name === 'AbortError') return 'OpenAI took too long to answer.' + tail;
  return 'Could not reach OpenAI (check your internet connection).' + tail;
}
function aiHistory() {                       // last few real turns, without placeholders, warnings or the greeting
  return chatLog.filter(m => !m.pending && !m.err && !m.greet && m.text).slice(-8)
    .map(m => ({ role: m.who === 'me' ? 'user' : 'assistant', content: String(m.text).slice(0, 1500) }));
}
async function askOpenAI(history) {
  const c = aiCfg(), proxy = !!AI_CONFIG.proxyUrl;
  const headers = { 'Content-Type': 'application/json' };
  if (!proxy) headers.Authorization = 'Bearer ' + c.key;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(proxy ? AI_CONFIG.proxyUrl : 'https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers, signal: ctl.signal,
      body: JSON.stringify({ model: c.model, messages: [{ role: 'system', content: AI_SYSTEM }, ...history], max_completion_tokens: 600 })
    });
    if (!res.ok) { let d = ''; try { d = (await res.json()).error.message; } catch {} throw new AIError(res.status, d); }
    const j = await res.json(), text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!text || !text.trim()) throw new AIError(0, 'empty reply');
    return text.trim();
  } finally { clearTimeout(timer); }
}

/* ---- chat bubbles (code fences become <pre>, links come only from the search API) ---- */
function chatBubble(m) {
  const d = document.createElement('div'); d.className = 'msg ' + m.who;
  String(m.text).split(/```[\w+#-]*\n?([\s\S]*?)```/).forEach((p, i, all) => {
    if (i % 2) { const pre = document.createElement('pre'); pre.className = 'msg-code'; pre.textContent = p.replace(/\n$/, ''); d.appendChild(pre); }
    else { p = (i > 0 ? p.replace(/^\n/, '') : p); if (i < all.length - 1) p = p.replace(/\n$/, ''); if (p) d.appendChild(document.createTextNode(p)); }
  });
  if (m.links && m.links.length) {
    const box = document.createElement('div'); box.className = 'links';
    m.links.forEach(l => { const a = document.createElement('a'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = '🔗 ' + l.title; box.appendChild(a); });
    d.appendChild(box);
  }
  if (m.meta) { const s = document.createElement('small'); s.className = 'meta'; s.textContent = m.meta; d.appendChild(s); }
  return d;
}
function chatAdd(text, who, opts) {
  const m = Object.assign({ text, who, els: [] }, opts);
  chatViews.forEach(v => { const el = chatBubble(m); m.els.push(el); v.box.appendChild(el); v.box.scrollTop = 1e9; });
  chatLog.push(m); return m;
}
function chatUpdate(m, text, extra) {
  Object.assign(m, { text, links: null, meta: '', pending: false }, extra);
  m.els.forEach((el, i) => { const n = chatBubble(m); el.replaceWith(n); m.els[i] = n; n.parentNode.scrollTop = 1e9; });
}

/* ---- Search API: Wikipedia (generator=search returns titles, intro extracts and URLs in one request) ---- */
async function webSearch(raw) {
  const q = raw.replace(/^(what|who|how|why|when|where)\s+(is|are|was|does|do|did)\s+(an?\s+|the\s+)?/i, '').replace(/[?!.]+$/, '').trim() || raw;
  const url = 'https://en.wikipedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: q, gsrlimit: '3', prop: 'extracts|info',
    exintro: '1', explaintext: '1', exsentences: '3', exlimit: 'max', inprop: 'url',
    format: 'json', formatversion: '2', origin: '*'
  });
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
  let data;
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } finally { clearTimeout(timer); }
  const pages = ((data.query && data.query.pages) || []).sort((a, b) => a.index - b.index);
  if (!pages.length) return { text: `I couldn't find anything for "${q}". Try different keywords.`, links: [] };
  const top = pages[0];
  return {
    text: `${top.title}: ${(top.extract || '').trim() || 'No summary available.'}\n\nSource: Wikipedia (live search)`,
    links: pages.filter(p => /^https:\/\/[a-z-]+\.wikipedia\.org\//.test(p.fullurl || '')).map(p => ({ title: p.title, url: p.fullurl }))
  };
}

async function chatSend(text, view) {
  text = (text ?? view.input.value).trim(); if (!text || chatBusy) return;
  chatViews.forEach(v => v.input.value = '');
  chatAdd(text, 'me'); chatBusy = true;
  const wait = chatAdd('Thinking', 'bot', { pending: true }); wait.els.forEach(e => e.classList.add('typing'));
  try {
    const forced = /^\/?search[:\s]+/i.test(text), q = text.replace(/^\/?search[:\s]+/i, '');
    let note = '';
    if (!forced && aiOn()) {
      try {
        const reply = await askOpenAI(aiHistory());
        chatUpdate(wait, reply, { meta: 'Answered by OpenAI' + (AI_CONFIG.proxyUrl ? '' : ' · ' + aiCfg().model) });
        return;
      } catch (e) { note = '⚠️ ' + aiErrorText(e) + '\n\n'; }
    }
    const hit = forced ? null : DEMO.find(([re]) => re.test(text.toLowerCase()));
    const flag = { err: !!note };
    if (hit) { await sleep(600); chatUpdate(wait, note + hit[1], flag); }
    else if (forced || store.get(WEB_KEY, true)) { const r = await webSearch(q); chatUpdate(wait, note + r.text, { links: r.links, ...flag }); }
    else chatUpdate(wait, note + 'I only know a few topics (sorting, searching, stack/queue, linked lists, Big-O). Connect OpenAI in AI settings or turn on "Search the web" to look up anything else.', flag);
  } catch (err) {
    chatUpdate(wait, 'The web search could not be reached (check your internet connection and try again).', { err: true });
  } finally { chatBusy = false; }
}

function mountAssistant(root, compact) {
  root.innerHTML = `<div class="chat${compact ? ' compact' : ''}" aria-live="polite"></div><div class="row sugg"></div>
    <label class="muted ai-toggle"><input type="checkbox" class="ai-web"> 🔎 Search the web (Wikipedia) for topics I don't know</label>
    <details class="ai-set"><summary>⚙️ AI settings · OpenAI <b class="ai-state"></b></summary>
      <div class="ai-form${AI_CONFIG.proxyUrl ? ' proxy' : ''}">
        <p class="muted ai-own">Paste your own OpenAI API key to get smart answers. It is saved only in this browser and sent only to OpenAI. Don't do this on a shared computer, and set a spending limit on the key.</p>
        <p class="muted ai-srv">Smart answers are provided by OpenAI through this site's secure server.</p>
        <input type="password" class="ai-text ai-key" autocomplete="off" spellcheck="false" aria-label="OpenAI API key">
        <input class="ai-text ai-model" autocomplete="off" spellcheck="false" aria-label="OpenAI model">
        <div class="row"><button type="button" class="btn primary ai-save">Save</button><button type="button" class="btn ai-clear">Remove key</button>
          <label class="ai-toggle"><input type="checkbox" class="ai-use"> Use OpenAI</label><span class="muted ai-msg" role="status"></span></div>
      </div></details>
    <div class="panel controls"><input class="chat-in" placeholder="Ask about an algorithm…" style="flex:1" aria-label="Message"><button class="btn primary chat-send">Send</button></div>`;
  const q = s => root.querySelector(s);
  const v = { box: q('.chat'), input: q('.chat-in'), web: q('.ai-web'), state: q('.ai-state'), key: q('.ai-key'), model: q('.ai-model'), use: q('.ai-use'), msg: q('.ai-msg') };
  chatViews.push(v);
  v.web.checked = store.get(WEB_KEY, true);
  v.web.onchange = () => { store.set(WEB_KEY, v.web.checked); chatViews.forEach(o => o.web.checked = v.web.checked); };
  q('.ai-save').onclick = () => {
    const k = v.key.value.trim();
    if (k && !/^sk-[\w-]{16,}$/.test(k)) { v.msg.textContent = 'That does not look like an OpenAI key (it starts with "sk-").'; return; }
    if (k) store.set('openaiKey', k);
    store.set('openaiModel', v.model.value.trim());
    syncAI(); v.msg.textContent = 'Saved ✓';
  };
  q('.ai-clear').onclick = () => { store.set('openaiKey', ''); syncAI(); v.msg.textContent = 'Key removed'; };
  v.use.onchange = () => { store.set('openaiOn', v.use.checked); syncAI(); };
  const sg = q('.sugg');
  sg.innerHTML = SUGG.map(s => `<button>${escHtml(s)}</button>`).join('');
  sg.querySelectorAll('button').forEach(b => b.onclick = () => chatSend(b.textContent, v));
  q('.chat-send').onclick = () => chatSend(undefined, v);
  v.input.onkeydown = e => { if (e.key === 'Enter') chatSend(undefined, v); };
  chatLog.forEach(m => { const el = chatBubble(m); m.els.push(el); v.box.appendChild(el); });
}
$$('[data-assistant]').forEach(r => mountAssistant(r, r.dataset.assistant === 'compact'));
chatAdd('Hi! I\'m the AlgoLab assistant. Ask me anything about data structures and algorithms. Try "What is a hash table?"', 'bot', { greet: true });
syncAI();

/* ---------- AI pop-up: floating button, attention-grabbing teaser bubble, chat window ---------- */
const pop = $('#ai-pop'), fab = $('#fab'), teaser = $('#ai-teaser'), dot = $('#fab-dot');
const TEASERS = ['👋 Stuck on an algorithm? <b>Ask me!</b>', '🔎 I can <b>search the web</b> for any DSA topic', '💡 Try asking: <b>“What is a hash table?”</b>'];
let teaserShown = 0, teaserOff = false;
try { teaserOff = sessionStorage.getItem('aiTeaserOff') === '1'; } catch {}
function stopTeasers() { teaserOff = true; teaser.hidden = true; try { sessionStorage.setItem('aiTeaserOff', '1'); } catch {} }
function popOpen(open) {
  pop.hidden = !open; fab.classList.toggle('open', open); fab.setAttribute('aria-expanded', String(open));
  $('#fab .ico').textContent = open ? '✕' : '💬';
  if (open) { stopTeasers(); dot.hidden = true; setTimeout(() => pop.querySelector('.chat-in').focus(), 60); }
}
function aiPopSync(id) {            // called by go(): the floating assistant is redundant on the AI page itself
  const onAI = id === 'ai'; fab.hidden = onAI;
  if (onAI) { popOpen(false); teaser.hidden = true; }
}
function showTeaser() {
  if (teaserOff || teaserShown >= TEASERS.length || !pop.hidden || fab.hidden) return;
  $('#ai-teaser-open').innerHTML = TEASERS[teaserShown++];
  teaser.hidden = false; dot.hidden = false;
  clearTimeout(showTeaser.t); showTeaser.t = setTimeout(() => teaser.hidden = true, 9000);
}
fab.onclick = () => popOpen(pop.hidden);
$('#pop-close').onclick = () => { popOpen(false); fab.focus(); };
$('#ai-teaser-open').onclick = () => popOpen(true);
$('#ai-teaser-x').onclick = stopTeasers;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { popOpen(false); fab.focus(); } });
setTimeout(showTeaser, 3000);                 // first nudge shortly after the page loads
setInterval(showTeaser, 40000);               // a different nudge later (max 3 per visit)

/* ================= Pseudocode ================= */
const PSEUDO = {
  bubble: `BubbleSort(A, n)
  for i = 0 to n-2
    for j = 0 to n-i-2
      if A[j] > A[j+1]
        swap(A[j], A[j+1])`,
  selection: `SelectionSort(A, n)
  for i = 0 to n-2
    min = i
    for j = i+1 to n-1
      if A[j] < A[min]: min = j
    swap(A[i], A[min])`,
  insertion: `InsertionSort(A, n)
  for i = 1 to n-1
    key = A[i]; j = i-1
    while j >= 0 and A[j] > key
      A[j+1] = A[j]; j = j-1
    A[j+1] = key`,
  merge: `MergeSort(A, l, r)
  if l >= r: return
  m = (l + r) / 2
  MergeSort(A, l, m)
  MergeSort(A, m+1, r)
  Merge(A, l, m, r)

Merge(A, l, m, r)
  L = A[l..m]; R = A[m+1..r]; i = j = 0; k = l
  while i < |L| and j < |R|
    if L[i] <= R[j]: A[k++] = L[i++]
    else:            A[k++] = R[j++]
  copy leftovers of L, then R, into A`,
  quick: `QuickSort(A, l, r)
  if l < r
    p = Partition(A, l, r)
    QuickSort(A, l, p-1)
    QuickSort(A, p+1, r)

Partition(A, l, r)
  pivot = A[r]; i = l
  for j = l to r-1
    if A[j] < pivot
      swap(A[i], A[j]); i = i+1
  swap(A[i], A[r])
  return i`,
  heap: `HeapSort(A, n)
  for i = n/2-1 down to 0: Heapify(A, n, i)
  for i = n-1 down to 1
    swap(A[0], A[i])
    Heapify(A, i, 0)

Heapify(A, size, i)
  largest = i; l = 2i+1; r = 2i+2
  if l < size and A[l] > A[largest]: largest = l
  if r < size and A[r] > A[largest]: largest = r
  if largest != i
    swap(A[i], A[largest])
    Heapify(A, size, largest)`,
  counting: `CountingSort(A, n)
  min = minimum of A; max = maximum of A
  count[0..max-min] = 0
  for each x in A: count[x-min]++
  k = 0
  for v = 0 to max-min
    while count[v] > 0
      A[k++] = v + min; count[v]--`,
  linear: `LinearSearch(A, n, target)
  for i = 0 to n-1
    if A[i] == target: return i
  return -1   // not found`,
  binary: `BinarySearch(A, n, target)   // A must be sorted
  lo = 0; hi = n-1
  while lo <= hi
    mid = (lo + hi) / 2
    if A[mid] == target: return mid
    if A[mid] < target:  lo = mid + 1
    else:                hi = mid - 1
  return -1   // not found`,
  ll: `InsertHead(v):  node = new Node(v); node.next = head
                if singly/circular-tail: update links; head = node
                (doubly: head.prev = node)
InsertTail(v):  walk to last node (or use tail); last.next = new Node(v)
                (circular: new.next = head; doubly: new.prev = last)
InsertAt(p, v): walk to node p-1; new.next = prev.next; prev.next = new
                (doubly: also fix prev pointers)
DeleteHead():   head = head.next            (circular: update tail.next)
DeleteTail():   walk to node before tail; its next = null (or head)
DeleteAt(p):    walk to node p-1; prev.next = prev.next.next
Search(v):      cur = head; while cur != null: if cur.value == v return cur; cur = cur.next
Traverse():     cur = head; while cur != null: visit(cur); cur = cur.next
                (circular: stop when cur returns to head)`,
  st: `Push(x):  if top == MAX-1: error "Overflow"
          top = top + 1; S[top] = x
Pop():    if top == -1: error "Underflow"
          x = S[top]; top = top - 1; return x
Peek():   if top == -1: error "Empty"; return S[top]
Clear():  top = -1`,
  qu: `Enqueue(x): if rear == MAX-1: error "Overflow"
            if front == -1: front = 0
            rear = rear + 1; Q[rear] = x
Dequeue():  if front == -1: error "Underflow"
            x = Q[front]
            if front == rear: front = rear = -1
            else front = front + 1
            return x
Front():    return Q[front]
Rear():     return Q[rear]`
};
$('#ll-pseudo').textContent = PSEUDO.ll;
$('#st-pseudo').textContent = PSEUDO.st;
$('#qu-pseudo').textContent = PSEUDO.qu;
{ const names = { ...Object.fromEntries(Object.entries(CX).map(([k, v]) => [k, v[0]])), linear: 'Linear Search', binary: 'Binary Search', ll: 'Linked List (all operations)', st: 'Stack', qu: 'Queue' };
  $('#all-pseudo').innerHTML = Object.keys(PSEUDO).map(k => `<h4>${names[k]}</h4><pre></pre>`).join('');
  $$('#all-pseudo pre').forEach((p, i) => p.textContent = PSEUDO[Object.keys(PSEUDO)[i]]); }

/* ================= Trees (Binary Tree + BST) ================= */
const TREE_PSEUDO = `Inorder(n):   if n == null return
              Inorder(n.left); visit(n); Inorder(n.right)
Preorder(n):  if n == null return
              visit(n); Preorder(n.left); Preorder(n.right)
Postorder(n): if n == null return
              Postorder(n.left); Postorder(n.right); visit(n)
LevelOrder(root): queue = [root]
  while queue not empty
    n = dequeue(queue); visit(n)
    enqueue n.left and n.right if they exist

BST_Insert(n, v)
  if n == null: return new Node(v)
  if v < n.value: n.left  = BST_Insert(n.left, v)
  else if v > n.value: n.right = BST_Insert(n.right, v)
  return n

BST_Search(n, v)
  while n != null
    if v == n.value: return n
    n = (v < n.value) ? n.left : n.right
  return null

BST_Delete(n, v)   // find the node first, then:
  0 children: remove it
  1 child:    replace it with that child
  2 children: copy the inorder successor (smallest value in the
              right subtree) into n, then delete that successor

BinaryTree_Insert(v):  put v in the first empty slot in level order
BinaryTree_Delete(v):  copy the last node's value over v, remove the last node`;
const GRAPH_PSEUDO = `BFS(graph, start)
  visited = {start}; queue = [start]
  while queue not empty
    u = dequeue(queue)
    for each neighbour v of u
      if v not in visited
        add v to visited; enqueue(v)

DFS(graph, u)
  mark u visited
  for each neighbour v of u
    if v not visited
      DFS(graph, v)       // go deeper, then backtrack`;
$('#t-pseudo').textContent = TREE_PSEUDO;
$('#g-pseudo').textContent = GRAPH_PSEUDO;
[['Binary Tree & BST', TREE_PSEUDO], ['Graph: BFS & DFS', GRAPH_PSEUDO]].forEach(([t, p]) => {
  $('#all-pseudo').insertAdjacentHTML('beforeend', `<h4>${t}</h4><pre></pre>`);
  $$('#all-pseudo pre').pop().textContent = p;
});
DEMO.unshift(
  [/tree|bst/, 'A binary search tree keeps smaller values in the left subtree and larger values in the right. Search, insert and delete are O(log n) on average, O(n) if the tree becomes a chain. Inorder traversal of a BST gives sorted order.'],
  [/bfs|dfs|graph|breadth|depth/, 'BFS uses a queue and explores level by level. DFS uses a stack (or recursion) and goes deep before backtracking. Both are O(V + E).']);

let bst = null, btArr = [], uid = 0, tBusy = false;
const popNode = id => $(`#t-svg [data-id="${id}"]`)?.classList.add('pop');
const tSay = t => $('#t-say').textContent = t;
const isBST = () => $('#t-mode').value === 'bst';
function treeRoot() {
  if (isBST()) return bst;
  const mk = i => i < btArr.length ? { id: i, v: btArr[i], l: mk(2 * i + 1), r: mk(2 * i + 2) } : null;
  return mk(0);
}
const bstHas = (n, v) => { while (n) { if (v === n.v) return true; n = v < n.v ? n.l : n.r; } return false; };
function bstInsert(n, v) {
  if (!n) return { id: uid++, v, l: null, r: null };
  if (v < n.v) n.l = bstInsert(n.l, v); else if (v > n.v) n.r = bstInsert(n.r, v);
  return n;
}
function bstDelete(n, v) {
  if (!n) return null;
  if (v < n.v) n.l = bstDelete(n.l, v);
  else if (v > n.v) n.r = bstDelete(n.r, v);
  else {
    if (!n.l) return n.r; if (!n.r) return n.l;
    let m = n.r; while (m.l) m = m.l;
    n.v = m.v; n.r = bstDelete(n.r, m.v);
  }
  return n;
}
const treeSize = () => isBST() ? (function c(n) { return n ? 1 + c(n.l) + c(n.r) : 0; })(bst) : btArr.length;
function renderTree(vis = new Set(), cur = -1, hit = -1) {
  const root = treeRoot(), svg = $('#t-svg');
  if (!root) { svg.setAttribute('viewBox', '0 0 300 80'); svg.style.width = '300px'; svg.innerHTML = '<text x="150" y="45" text-anchor="middle" fill="currentColor">Empty tree: insert a value</text>'; return; }
  let x = 0, maxD = 0; const P = new Map();
  (function lay(n, d) { if (!n) return; lay(n.l, d + 1); P.set(n.id, { x: 30 + 50 * x++, y: 30 + 60 * d }); maxD = Math.max(maxD, d); lay(n.r, d + 1); })(root, 0);
  let s = '';
  (function edges(n) { if (!n) return; const p = P.get(n.id); for (const ch of [n.l, n.r]) if (ch) { const q = P.get(ch.id); s += `<line class="ge" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`; edges(ch); } })(root);
  (function nodes(n) {
    if (!n) return; const p = P.get(n.id);
    s += `<g data-id="${n.id}" class="gn ${n.id === hit ? 'hit' : n.id === cur ? 'cur' : vis.has(n.id) ? 'vis' : ''}"><circle cx="${p.x}" cy="${p.y}" r="20"/><text x="${p.x}" y="${p.y}" dy=".35em">${n.v}</text></g>`;
    nodes(n.l); nodes(n.r);
  })(root);
  svg.setAttribute('viewBox', `0 0 ${x * 50 + 10} ${maxD * 60 + 60}`);
  svg.style.width = Math.max(x * 50 + 10, 200) + 'px';
  svg.innerHTML = s;
}
function walk(kind, root) {
  const out = [];
  if (kind === 'level') { const q = root ? [root] : []; while (q.length) { const n = q.shift(); out.push(n); n.l && q.push(n.l); n.r && q.push(n.r); } return out; }
  (function f(n) { if (!n) return; if (kind === 'pre') out.push(n); f(n.l); if (kind === 'in') out.push(n); f(n.r); if (kind === 'post') out.push(n); })(root);
  return out;
}
async function animateNodes(list, label, finalText, hitId = -1) {
  tBusy = true;
  try {
    const seen = new Set(), vals = [];
    for (const n of list) {
      seen.add(n.id); vals.push(n.v);
      renderTree(seen, n.id); $('#t-order').textContent = `${label}: ${vals.join(' → ')}`;
      tSay(`Visiting node ${n.v}.`); await sleep(600);
    }
    renderTree(seen, -1, hitId); tSay(finalText);
  } finally { tBusy = false; }
}
function readTreeVal() {
  const raw = $('#t-val').value, v = Number(raw);
  if (raw === '' || !Number.isInteger(v) || v < -999 || v > 999) { tSay('Enter a whole number between -999 and 999.'); return null; }
  return v;
}
$('#t-ins').onclick = () => {
  if (tBusy) return; const v = readTreeVal(); if (v === null) return;
  if (treeSize() >= 31) return tSay('Tree is full for this demo (31 nodes).');
  if (isBST()) {
    if (bstHas(bst, v)) return tSay(`${v} is already in the BST (duplicates are ignored).`);
    bst = bstInsert(bst, v); tSay(`Inserted ${v}: started at the root and went left for smaller, right for larger values until a free spot was found.`);
  } else { btArr.push(v); tSay(`Inserted ${v} in the first free position in level order, so the tree stays complete.`); }
  $('#t-order').textContent = ''; renderTree(); popNode(isBST() ? uid - 1 : btArr.length - 1);
};
$('#t-del').onclick = () => {
  if (tBusy) return; const v = readTreeVal(); if (v === null) return;
  if (isBST()) {
    if (!bstHas(bst, v)) return tSay(`${v} is not in the tree.`);
    bst = bstDelete(bst, v); tSay(`Deleted ${v}. A node with two children is replaced by its inorder successor.`);
  } else {
    const i = btArr.indexOf(v); if (i < 0) return tSay(`${v} is not in the tree.`);
    btArr[i] = btArr[btArr.length - 1]; btArr.pop(); tSay(`Deleted ${v}: the last node's value took its place, then the last node was removed.`);
  }
  $('#t-order').textContent = ''; renderTree();
};
$('#t-find').onclick = () => {
  if (tBusy) return; const v = readTreeVal(); if (v === null) return;
  const root = treeRoot(); if (!root) return tSay('The tree is empty.');
  let path = [];
  if (isBST()) { let n = root; while (n) { path.push(n); if (n.v === v) break; n = v < n.v ? n.l : n.r; } }
  else { for (const n of walk('level', root)) { path.push(n); if (n.v === v) break; } }
  const last = path[path.length - 1], ok = last.v === v;
  animateNodes(path, 'Search path', ok ? `Found ${v} after ${path.length} step(s).` : `${v} is not in the tree.`, ok ? last.id : -1);
};
$('#t-run').onclick = () => {
  if (tBusy) return; const root = treeRoot(); if (!root) return tSay('The tree is empty: insert values first.');
  const k = $('#t-trav').value, names = { in: 'Inorder', pre: 'Preorder', post: 'Postorder', level: 'Level order' };
  const txt = { in: 'Left subtree, node, right subtree (sorted order for a BST).', pre: 'Node first, then left, then right.', post: 'Left, right, then the node.', level: 'Row by row using a queue.' };
  animateNodes(walk(k, root), names[k], `${names[k]} finished. ${txt[k]}`);
};
$('#t-rand').onclick = () => {
  if (tBusy) return; bst = null; btArr = [];
  const vals = new Set(); while (vals.size < 7) vals.add(1 + Math.floor(Math.random() * 99));
  vals.forEach(v => { if (isBST()) bst = bstInsert(bst, v); else btArr.push(v); });
  $('#t-order').textContent = ''; tSay('Random tree created.'); renderTree();
};
$('#t-clear').onclick = () => { if (tBusy) return; bst = null; btArr = []; $('#t-order').textContent = ''; tSay('Tree cleared.'); renderTree(); };
$('#t-mode').onchange = () => { if (!tBusy) { $('#t-order').textContent = ''; tSay(isBST() ? 'BST mode: smaller values go left, larger go right.' : 'Binary tree mode: values fill the tree level by level.'); renderTree(); } };
[50, 30, 70, 20, 40, 60, 80].forEach(v => bst = bstInsert(bst, v));
btArr = [1, 2, 3, 4, 5, 6, 7];
renderTree();

/* ================= Graphs: BFS & DFS ================= */
const GN = 'ABCDEFG'.split('');
let gEdges = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['B', 'E'], ['C', 'F'], ['E', 'G'], ['D', 'E']];
const gPos = {};
GN.forEach((n, i) => { const a = i / GN.length * 2 * Math.PI - Math.PI / 2; gPos[n] = { x: 180 + 120 * Math.cos(a), y: 150 + 120 * Math.sin(a) }; });
$('#g-start').innerHTML = GN.map(n => `<option>${n}</option>`).join('');
function adjacency() {
  const m = Object.fromEntries(GN.map(n => [n, []]));
  gEdges.forEach(([a, b]) => { m[a].push(b); m[b].push(a); });
  for (const k in m) m[k].sort();
  return m;
}
/* Pure algorithm logic: returns snapshots, no DOM */
function graphSteps(kind, start) {
  const g = adjacency(), vis = [], tree = [], steps = []; let ds = [];
  const snap = (cur, text) => steps.push({ vis: [...vis], cur, ds: [...ds], tree: tree.map(e => [...e]), text, kind });
  snap(null, `${kind.toUpperCase()} starting from ${start}. Press Play or Next.`);
  if (kind === 'bfs') {
    vis.push(start); ds = [start]; snap(start, `Mark ${start} visited and enqueue it.`);
    while (ds.length) {
      const u = ds.shift(); snap(u, `Dequeue ${u}. Its neighbours: ${g[u].join(', ') || 'none'}.`);
      for (const v of g[u]) if (!vis.includes(v)) { vis.push(v); ds.push(v); tree.push([u, v]); snap(u, `${v} is new: mark it visited and enqueue it.`); }
    }
  } else {
    const dfs = u => {
      vis.push(u); ds.push(u); snap(u, `Visit ${u} (push onto the call stack).`);
      for (const v of g[u]) if (!vis.includes(v)) { tree.push([u, v]); snap(u, `Go from ${u} to unvisited neighbour ${v}.`); dfs(v); snap(u, `Back at ${u}: backtrack and check the next neighbour.`); }
      ds.pop();
    };
    dfs(start);
  }
  const miss = GN.filter(n => !vis.includes(n));
  snap(null, `Done. Visit order: ${vis.join(' → ')}.` + (miss.length ? ` Not reachable from ${start}: ${miss.join(', ')}.` : ''));
  return steps;
}
const graphPlayer = makePlayer(st => {
  const on = (a, b) => st.tree.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  $('#g-svg').innerHTML =
    gEdges.map(([a, b]) => `<line class="ge ${on(a, b) ? 'on' : ''}" x1="${gPos[a].x}" y1="${gPos[a].y}" x2="${gPos[b].x}" y2="${gPos[b].y}"/>`).join('') +
    GN.map(n => `<g class="gn ${n === st.cur ? 'cur' : st.vis.includes(n) ? 'vis' : ''}"><circle cx="${gPos[n].x}" cy="${gPos[n].y}" r="20"/><text x="${gPos[n].x}" y="${gPos[n].y}" dy=".35em">${n}</text></g>`).join('');
  $('#g-text').textContent = st.text;
  $('#g-ds').textContent = (st.kind === 'bfs' ? 'Queue (front → rear): ' : 'Call stack (bottom → top): ') + '[' + st.ds.join(', ') + ']';
  $('#g-order').textContent = 'Visited: ' + (st.vis.join(' → ') || '–');
}, $('#g-speed'), on => $('#g-play').textContent = on ? '⏸ Pause' : '▶ Play');
function loadGraph() {
  $('#g-edges').value = gEdges.map(e => e.join('-')).join(', ');
  graphPlayer.load(graphSteps($('#g-algo').value, $('#g-start').value));
}
$('#g-apply').onclick = () => {
  const parts = $('#g-edges').value.toUpperCase().split(/[\s,]+/).filter(Boolean), out = [];
  for (const p of parts) {
    const m = p.match(/^([A-G])-([A-G])$/);
    if (!m || m[1] === m[2]) { $('#g-text').textContent = `Invalid edge "${p}". Use letters A–G like A-B, B-C (no self loops).`; return; }
    if (!out.some(([a, b]) => (a === m[1] && b === m[2]) || (a === m[2] && b === m[1]))) out.push([m[1], m[2]]);
  }
  gEdges = out; loadGraph();
};
$('#g-rand').onclick = () => {
  const e = [], has = (a, b) => e.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  for (let i = 1; i < GN.length; i++) e.push([GN[Math.floor(Math.random() * i)], GN[i]]);
  for (let k = 0; k < 3; k++) { const a = GN[Math.floor(Math.random() * 7)], b = GN[Math.floor(Math.random() * 7)]; if (a !== b && !has(a, b)) e.push([a, b]); }
  gEdges = e; loadGraph();
};
$('#g-algo').onchange = $('#g-start').onchange = loadGraph;
$('#g-play').onclick = () => graphPlayer.toggle();
$('#g-next').onclick = () => graphPlayer.next();
$('#g-prev').onclick = () => graphPlayer.prev();
$('#g-reset').onclick = () => graphPlayer.reset();
loadGraph();

/* ================= Bug Hunter game ================= */
// Each level: code lines, index of the buggy line, hint, 3 fix options (ok = correct) and an explanation
const BUGS = [
  { d: 'Easy', t: 'Linear Search', goal: 'Should return the index of t in a, or -1 if it is missing.',
    code: ['function linearSearch(a, t) {', '  for (let i = 0; i <= a.length; i++) {', '    if (a[i] === t) return i;', '  }', '  return -1;', '}'], bug: 1,
    hint: 'Valid indexes run from 0 to length - 1. What is a[a.length]?',
    fix: ['  for (let i = 0; i < a.length; i++) {', '  for (let i = 0; i < a.length - 1; i++) {', '  for (let i = 1; i <= a.length; i++) {'],
    why: 'a[a.length] is past the end of the array, so the loop must stop before length. Using length - 1 would skip the last element.' },
  { d: 'Easy', t: 'Array Sum', goal: 'Should return the sum of all numbers in a.',
    code: ['function sum(a) {', '  let total = 1;', '  for (const x of a) total += x;', '  return total;', '}'], bug: 1,
    hint: 'What value should a running sum have before any numbers are added?',
    fix: ['  let total = 0;', '  let total = a[0];', '  let total = -1;'],
    why: '0 is the identity for addition. Starting at a[0] would count the first item twice.' },
  { d: 'Easy', t: 'Stack Pop', goal: 'Should remove and return the TOP item of an array-based stack.',
    code: ['function pop(stack) {', '  if (stack.length === 0) return null;', '  const top = stack[stack.length];', '  stack.length--;', '  return top;', '}'], bug: 2,
    hint: 'Where is the TOP stored? Remember the last valid index.',
    fix: ['  const top = stack[stack.length - 1];', '  const top = stack[0];', '  const top = stack[stack.length + 1];'],
    why: 'The top of an array stack is the last element, at index length - 1. stack[length] is undefined.' },
  { d: 'Medium', t: 'Binary Search', goal: 'Should return the index of t in a sorted array, or -1.',
    code: ['function binarySearch(a, t) {', '  let lo = 0, hi = a.length - 1;', '  while (lo <= hi) {', '    const mid = Math.floor((lo + hi) / 2);', '    if (a[mid] === t) return mid;', '    if (a[mid] < t) lo = mid;', '    else hi = mid - 1;', '  }', '  return -1;', '}'], bug: 5,
    hint: 'If a[mid] is already too small, should mid stay inside the range? Can the loop get stuck?',
    fix: ['    if (a[mid] < t) lo = mid + 1;', '    if (a[mid] < t) hi = mid - 1;', '    if (a[mid] < t) lo = 0;'],
    why: 'a[mid] was just checked, so the new range must start after it: lo = mid + 1. With lo = mid the loop can repeat forever.' },
  { d: 'Medium', t: 'Bubble Sort', goal: 'Should sort a in ascending order.',
    code: ['function bubbleSort(a) {', '  const n = a.length;', '  for (let i = 0; i < n - 1; i++) {', '    for (let j = 0; j < n; j++) {', '      if (a[j] > a[j + 1]) [a[j], a[j + 1]] = [a[j + 1], a[j]];', '    }', '  }', '  return a;', '}'], bug: 3,
    hint: 'When j = n - 1, what is a[j + 1]? Also, how many items are already in place after pass i?',
    fix: ['    for (let j = 0; j < n - i - 1; j++) {', '    for (let j = 1; j < n; j++) {', '    for (let j = 0; j <= n; j++) {'],
    why: 'a[j + 1] must exist, so j stops at n - 2. After each pass the largest i items are in place, hence n - i - 1.' },
  { d: 'Medium', t: 'Selection Sort', goal: 'Should sort a in ascending order by repeatedly selecting the minimum.',
    code: ['function selectionSort(a) {', '  for (let i = 0; i < a.length - 1; i++) {', '    let min = i;', '    for (let j = i + 1; j < a.length; j++) {', '      if (a[j] > a[min]) min = j;', '    }', '    [a[i], a[min]] = [a[min], a[i]];', '  }', '  return a;', '}'], bug: 4,
    hint: 'The variable is called min. Which comparison finds a smaller value?',
    fix: ['      if (a[j] < a[min]) min = j;', '      if (a[j] === a[min]) min = j;', '      if (a[j] > a[i]) min = j;'],
    why: 'To track the minimum you update when a[j] is smaller. Using > would find the maximum.' },
  { d: 'Hard', t: 'Breadth-First Search', goal: 'Should visit graph nodes level by level using a queue.',
    code: ['function bfs(g, start) {', '  const seen = new Set([start]), queue = [start], order = [];', '  while (queue.length) {', '    const u = queue.pop();', '    order.push(u);', '    for (const v of g[u]) if (!seen.has(v)) { seen.add(v); queue.push(v); }', '  }', '  return order;', '}'], bug: 3,
    hint: 'A queue is FIFO. Which array method removes from the FRONT?',
    fix: ['    const u = queue.shift();', '    const u = queue.push();', '    const u = queue[queue.length];'],
    why: 'pop() removes from the rear, which makes the code behave like DFS. shift() removes the oldest item (FIFO).' },
  { d: 'Hard', t: 'Merge Sort', goal: 'Should return a sorted copy of a using divide and conquer.',
    code: ['function mergeSort(a) {', '  if (a.length < 1) return a;', '  const mid = Math.floor(a.length / 2);', '  const left = mergeSort(a.slice(0, mid));', '  const right = mergeSort(a.slice(mid));', '  return merge(left, right);', '}'], bug: 1,
    hint: 'What happens with a one-element array? Does the recursion ever stop?',
    fix: ['  if (a.length <= 1) return a;', '  if (a.length < 0) return a;', '  if (a.length === 2) return a;'],
    why: 'A 1-element array is already sorted and must stop the recursion. With < 1 it keeps splitting forever (stack overflow).' },
  { d: 'Hard', t: 'Depth-First Search', goal: 'Should visit every reachable node once (the graph is undirected).',
    code: ['function dfs(g, u, seen = new Set(), order = []) {', '  seen.add(u);', '  order.push(u);', '  for (const v of g[u]) dfs(g, v, seen, order);', '  return order;', '}'], bug: 3,
    hint: 'In an undirected graph A leads to B and B leads back to A. What stops the bouncing?',
    fix: ['  for (const v of g[u]) if (!seen.has(v)) dfs(g, v, seen, order);', '  for (const v of g[u]) if (seen.has(v)) dfs(g, v, seen, order);', '  for (const v of g[u]) dfs(g, u, seen, order);'],
    why: 'Only recurse into unvisited neighbours; otherwise nodes call each other forever.' }
];
const bgEsc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let bgSave = store.get('bugSave', { unlocked: 0, pts: {} }), bg = {};
const bgTotal = () => Object.values(bgSave.pts).reduce((a, b) => a + b, 0);

function bgStart(i) {
  const L = BUGS[i];
  bg = { lvl: i, lives: 3, phase: 'find', hint: false, wrong: 0, gain: 0, msg: '', bad: new Set(), tried: new Set(),
    opts: L.fix.map((t, k) => ({ t, ok: k === 0 })).sort(() => Math.random() - .5) };
  bgRender();
}
function bgRender() {
  $('#bg-levels').innerHTML = BUGS.map((L, i) => {
    const done = bgSave.pts[i] !== undefined, lock = i > bgSave.unlocked;
    return `<button class="chip ${i === bg.lvl && bg.phase !== 'win' ? 'on' : ''} ${done ? 'done' : ''}" data-lv="${i}" ${lock ? 'disabled' : ''} title="${L.d}: ${L.t}">${i + 1}${done ? ' ✓' : lock ? ' 🔒' : ''}</button>`;
  }).join('');
  const L = BUGS[bg.lvl], total = bgTotal(), max = BUGS.length * 100;
  if (bg.phase === 'win') {
    const rank = total >= 800 ? 'Master Debugger 🏆' : total >= 550 ? 'Skilled Hunter ⭐' : 'Rookie Hunter 🐛';
    $('#bg-game').innerHTML = `<h3>All bugs squashed!</h3><p class="say">Score: ${total} / ${max} · ${rank}</p><p class="muted">Tip: replay a level without hints to improve your score.</p><button class="btn primary" data-act="again">Play again</button>`;
    return;
  }
  let h = `<div class="row"><b>Level ${bg.lvl + 1} / ${BUGS.length} · ${L.t}</b><span class="badge">${L.d}</span>
    <span style="margin-left:auto" aria-label="${bg.lives} lives left">${'❤️'.repeat(bg.lives)}${'🖤'.repeat(3 - bg.lives)}</span><span>Score: ${total}</span></div>
    <p>${L.goal}</p><div class="code">` +
    L.code.map((ln, i) => `<button class="cl ${bg.bad.has(i) ? 'bad' : ''} ${bg.phase !== 'find' && i === L.bug ? 'good' : ''}" data-act="line" data-i="${i}" ${bg.phase !== 'find' ? 'disabled' : ''}><span class="ln">${i + 1}</span><code>${bgEsc(ln)}</code></button>`).join('') + '</div>';
  if (bg.msg) h += `<p class="muted">${bg.msg}</p>`;
  if (bg.phase === 'find') h += '<p class="say">🔎 Click the line that contains the bug.</p>' +
    (bg.hint ? `<p class="muted">💡 ${L.hint}</p>` : '<button class="btn" data-act="hint">Show hint (−30 pts)</button>');
  else if (bg.phase === 'fix') h += `<p class="say">✅ Line ${L.bug + 1} is the buggy one. Pick the correct fix:</p>` +
    bg.opts.map((o, k) => `<button class="opt ${bg.tried.has(k) ? 'wrong' : ''}" data-act="opt" data-k="${k}" ${bg.tried.has(k) ? 'disabled' : ''}><code>${bgEsc(o.t.trim())}</code></button>`).join('');
  else if (bg.phase === 'done') h += `<p class="say">🎉 Bug squashed! +${bg.gain} pts</p><p>${L.why}</p><button class="btn primary" data-act="next">${bg.lvl < BUGS.length - 1 ? 'Next level →' : 'Finish'}</button>`;
  else if (bg.phase === 'over') h += `<p class="say">💥 Out of lives. The bug was on line ${L.bug + 1}.</p><p>${L.why}</p><button class="btn primary" data-act="retry">Retry level</button>`;
  $('#bg-game').innerHTML = h;
}
$('#bg-levels').onclick = e => { const b = e.target.closest('[data-lv]'); if (b && !b.disabled) bgStart(+b.dataset.lv); };
$('#bg-game').onclick = e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, L = BUGS[bg.lvl];
  const lose = msg => { bg.wrong++; bg.lives--; bg.msg = msg; if (bg.lives <= 0) { bg.phase = 'over'; bg.msg = ''; } };
  if (a === 'hint') bg.hint = true;
  else if (a === 'line') {
    const i = +b.dataset.i;
    if (i === L.bug) { bg.phase = 'fix'; bg.msg = ''; } else { bg.bad.add(i); lose(`Line ${i + 1} is fine. You lost a life.`); }
  } else if (a === 'opt') {
    const k = +b.dataset.k;
    if (bg.opts[k].ok) {
      bg.gain = Math.max(20, 100 - 30 * bg.hint - 20 * bg.wrong); bg.phase = 'done'; bg.msg = '';
      bgSave.pts[bg.lvl] = Math.max(bgSave.pts[bg.lvl] ?? 0, bg.gain);
      bgSave.unlocked = Math.max(bgSave.unlocked, Math.min(bg.lvl + 1, BUGS.length - 1));
      store.set('bugSave', bgSave);
    } else { bg.tried.add(k); lose('That does not fix the bug. You lost a life.'); }
  } else if (a === 'next') { if (bg.lvl < BUGS.length - 1) return bgStart(bg.lvl + 1); bg.phase = 'win'; }
  else if (a === 'retry') return bgStart(bg.lvl);
  else if (a === 'again') return bgStart(0);
  bgRender();
};
$('#bg-restart').onclick = () => bgStart(bg.lvl);
$('#bg-reset').onclick = () => {
  if (!confirm('Reset Bug Hunter? This clears your score and locks every level except Level 1.')) return;
  bgSave = { unlocked: 0, pts: {} }; store.set('bugSave', bgSave);
  bgStart(0);
  const msg = $('#bg-reset-msg'); msg.textContent = 'Game reset. Back to Level 1.';
  setTimeout(() => msg.textContent = '', 3000);
};
bgStart(Math.min(bgSave.unlocked, BUGS.length - 1));

/* ================= Init ================= */
sortInput = [34, 7, 23, 32, 5, 62, 14, 48, 19, 41];
loadSort();
loadSearch();
go('home');
