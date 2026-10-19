/* AlgoLab AI boost: additive layer. It only calls the existing assistant (popOpen / chatSend / chatViews),
   so script.js is untouched. Remove this file + its tags in index.html and the app is exactly as before. */
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const has = n => { try { return typeof (0, eval)(n) !== 'undefined'; } catch { return false; } };

  // Optional: set the proxy URL in <meta name="algolab-proxy-url"> instead of editing script.js
  const meta = $('meta[name="algolab-proxy-url"]'), url = meta && meta.content.trim();
  if (url && has('AI_CONFIG') && !AI_CONFIG.proxyUrl) {
    AI_CONFIG.proxyUrl = url;
    $$('.ai-form').forEach(f => f.classList.add('proxy'));
    if (has('syncAI')) syncAI();
  }

  function ask(prompt) {
    if (!has('chatSend') || !has('popOpen')) return;
    if ($('#ai').hidden) popOpen(true);                       // on the AI page the chat is already visible
    const v = chatViews.find(x => x.box.offsetParent) || chatViews[0];
    chatSend(prompt, v);
  }

  // AI study panel on the home page
  const P = {
    explain: t => `Explain ${t} like I'm a beginner, with a real-life analogy and a tiny example.`,
    quiz: t => `Quiz me on ${t}: ask 3 short questions, one at a time.`,
    practice: t => `Give me a practice problem on ${t} with a hint (no full solution yet).`,
    compare: t => `Compare ${t} with its closest alternative: when to use each, and their complexity.`,
    plan: t => `Make me a 7-day study plan to learn ${t}.`
  };
  $$('[data-ab]').forEach(b => b.onclick = () => ask(P[b.dataset.ab](($('#ab-topic').value || '').trim() || 'sorting algorithms')));
  const topic = $('#ab-topic');
  if (topic) topic.onkeydown = e => { if (e.key === 'Enter') ask(P.explain(topic.value.trim() || 'sorting algorithms')); };

  const pill = $('#ab-status');
  function status() {
    if (!pill) return;
    const on = has('aiOn') && aiOn();
    pill.className = 'ab-pill' + (on ? ' on' : '');
    pill.textContent = on ? '● OpenAI connected' : '● Demo mode: built-in answers + web search';
  }
  status(); setInterval(status, 1500);

  // "Ask AI" buttons on the visualizer pages, aware of what the learner has selected
  const sel = id => { const e = $(id); return e && e.selectedOptions[0] ? e.selectedOptions[0].text : ''; };
  const tab = id => { const b = $(id + ' .tabs .on'); return b ? b.textContent.trim() : ''; };
  const CTX = {
    sorting: () => sel('#s-algo') + ' (sorting)',
    searching: () => sel('#q-algo'),
    ds: () => tab('#ds'),
    tg: () => tab('#tg'),
    bug: () => 'finding bugs in sorting and searching code',
    dash: () => 'data structures and algorithms'
  };
  Object.keys(CTX).forEach(id => {
    const h = $('#' + id + ' > h2'); if (!h) return;
    const d = document.createElement('div'); d.className = 'row ab-ctx';
    d.innerHTML = '<span class="lbl">🤖 AI help:</span><button type="button" data-k="explain">Explain this</button><button type="button" data-k="quiz">Quiz me</button><button type="button" data-k="practice">Give me practice</button>';
    h.after(d);
    d.onclick = e => { const b = e.target.closest('[data-k]'); if (b) ask(P[b.dataset.k](CTX[id]())); };
  });
})();
