/**
 * AlgoLab OpenAI proxy (Cloudflare Worker, free plan is enough to start)
 *
 * Why: a key placed in script.js can be read by anyone who opens your site and then
 * used up on your bill. This tiny server keeps the key private and only talks to your site.
 *
 * Setup (about 5 minutes):
 *  1. Create a free account at https://dash.cloudflare.com  ->  Workers & Pages  ->  Create  ->  "Hello World" worker.
 *  2. Click "Edit code", paste this whole file, and press Deploy.
 *  3. Worker  ->  Settings  ->  Variables and Secrets  ->  add a SECRET named OPENAI_API_KEY with your key.
 *  4. Copy the worker URL (https://something.YOURNAME.workers.dev) into AI_CONFIG.proxyUrl in script.js.
 *  5. In the OpenAI dashboard, set a monthly spending limit for the key. Also consider adding
 *     a Cloudflare rate-limiting rule for this worker, because the Origin check below only stops
 *     other *websites* from using it, not scripts that fake the header.
 */

const ALLOWED_ORIGINS = [
  'https://kartik25200811.github.io'   // your GitHub Pages site (origin only, no path). Add http://localhost:8000 while testing.
];
const MODEL = 'gpt-4o-mini';            // change here if OpenAI retires or renames the model
const MAX_OUTPUT_TOKENS = 600;
const MAX_MESSAGES = 12;                // recent turns accepted from the browser
const MAX_CHARS = 2000;                 // per message
const SYSTEM_PROMPT =
  'You are the AlgoLab assistant, a friendly tutor for beginners learning data structures and algorithms. ' +
  'Be accurate and concise (under 150 words unless asked for more). Use plain text, with triple-backtick code fences for code and no other Markdown. ' +
  'AlgoLab has visualizers for sorting, searching, linked lists, stacks, queues, trees and graphs (BFS/DFS), plus a Bug Hunter game, a quiz and a student dashboard; point to them when helpful. ' +
  'If a question is unrelated to computer science or programming, politely steer back to DSA.';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const reply = (obj, status) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST' || !allowed) return reply({ error: { message: 'Forbidden' } }, 403);
    if (!env.OPENAI_API_KEY) return reply({ error: { message: 'Server is missing OPENAI_API_KEY' } }, 500);

    let body;
    try { body = await request.json(); } catch { return reply({ error: { message: 'Invalid JSON' } }, 400); }

    // Only user/assistant turns are accepted from the browser. The system prompt, model and
    // token limit are fixed here so visitors cannot change them.
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
      .slice(-MAX_MESSAGES)
      .map(m => ({ role: m.role, content: String(m.content || '').slice(0, MAX_CHARS) }));
    if (!messages.length || messages[messages.length - 1].role !== 'user')
      return reply({ error: { message: 'Send at least one user message' } }, 400);

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.OPENAI_API_KEY },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_completion_tokens: MAX_OUTPUT_TOKENS
      })
    });
    // Pass OpenAI's JSON (same shape the browser expects) straight back.
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
};
