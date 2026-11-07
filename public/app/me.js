// Ariadne /me — participant dashboard: research progress, Builder Fingerprint, offers/needs, top-3 matches.
// Every value is written with textContent (never innerHTML), and links are only created for https URLs.
(() => {
  const POLL_MS = 4000;
  const REFRESH_DEBOUNCE_MS = 250;
  const SCORE_LABELS = {
    capability_similarity: 'Capability',
    need_offer_fit: 'Need/Offer',
    complementarity: 'Complementarity',
    novelty: 'Novelty',
    freshness: 'Freshness',
  };

  let myAlias = null;
  let cursor = 0;
  let refreshTimer = null;
  let pollTimer = null;
  let withdrawArmed = false;

  /**
   * Creates an element with text and attributes.
   * @param {string} tag - Tag name.
   * @param {{className?: string, text?: string, attrs?: Record<string, string>}} [opts] - Content.
   * @param {Node[]} [children] - Child nodes.
   * @returns {HTMLElement} The element.
   */
  function el(tag, opts = {}, children = []) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text !== undefined) node.textContent = opts.text;
    for (const [name, value] of Object.entries(opts.attrs || {})) node.setAttribute(name, value);
    for (const child of children) node.appendChild(child);
    return node;
  }

  /**
   * A link pill to public evidence, or a plain pill when the URL is not https.
   * @param {{source_url: string, title_or_summary: string, repo_full_name: string|null}} pill - Evidence receipt.
   * @returns {HTMLElement} The pill.
   */
  function evidencePill(pill) {
    const label = pill.repo_full_name || pill.title_or_summary;
    if (typeof pill.source_url !== 'string' || !pill.source_url.startsWith('https://')) {
      return el('span', { className: 'pill', text: label });
    }
    return el('a', {
      className: 'pill',
      text: label,
      attrs: { href: pill.source_url, target: '_blank', rel: 'noopener noreferrer' },
    });
  }

  /**
   * A horizontal bar row.
   * @param {string} label - Row label.
   * @param {number} percent - 0–100.
   * @param {string} valueText - Text shown after the bar.
   * @returns {HTMLElement} The row.
   */
  function bar(label, percent, valueText) {
    const fill = el('div', { className: 'bar-fill' });
    fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    return el('div', { className: 'bar-row' }, [
      el('span', { text: label }),
      el('div', { className: 'bar-track' }, [fill]),
      el('span', { className: 'muted', text: valueText }),
    ]);
  }

  /**
   * Renders the three-step research stepper.
   * @param {{label: string, status: string}[]} steps - Steps from the server.
   */
  function renderProgress(steps) {
    const list = document.getElementById('progress');
    list.replaceChildren(
      ...steps.map((step) => el('li', { className: `step step-${step.status}` }, [
        el('span', { className: 'step-dot', attrs: { 'aria-hidden': 'true' } }),
        el('span', { text: `${step.label}${step.status === 'failed' ? ' — could not finish' : ''}` }),
      ])),
    );
  }

  /**
   * Renders the 6-axis fingerprint bars.
   * @param {{axes: {label: string, value: number}[]}|null} fingerprint - Fingerprint, if computed yet.
   */
  function renderFingerprint(fingerprint) {
    const box = document.getElementById('fingerprint');
    if (!fingerprint) {
      box.replaceChildren(el('p', { className: 'muted', text: 'Reading your public GitHub…' }));
      return;
    }
    box.replaceChildren(el('div', { className: 'bars' }, fingerprint.axes.map((axis) => bar(axis.label, axis.value, String(Math.round(axis.value))))));
  }

  /**
   * Renders offer or need pills, with a dismiss control on AI inferences.
   * @param {string} containerId - Target element id.
   * @param {object[]} items - Offers or needs.
   * @param {'claims'|'needs'} kind - Which dismiss endpoint applies.
   * @param {(item: object) => string} labelOf - Pill text.
   */
  function renderPills(containerId, items, kind, labelOf) {
    const box = document.getElementById(containerId);
    if (!items.length) {
      box.replaceChildren(el('span', { className: 'muted', text: 'Nothing yet.' }));
      return;
    }
    box.replaceChildren(...items.map((item) => {
      const pill = el('span', { className: item.dismissible ? 'pill pill-inferred' : 'pill', text: labelOf(item) });
      if (item.dismissible) {
        const x = el('button', { text: '×', attrs: { type: 'button', 'aria-label': `Dismiss ${labelOf(item)} (AI inference)` } });
        x.addEventListener('click', () => dismiss(kind, item.id));
        pill.appendChild(x);
      }
      return pill;
    }));
  }

  /**
   * One match card.
   * @param {object} match - Match from `/api/me`.
   * @returns {HTMLElement} The card.
   */
  function matchCard(match) {
    const who = match.counterpart.github_username ? `@${match.counterpart.github_username}` : match.counterpart.display_alias;
    const breakdown = Object.entries(SCORE_LABELS)
      .filter(([key]) => typeof match.score_breakdown[key] === 'number')
      .map(([key, label]) => bar(label, match.score_breakdown[key] * 100, match.score_breakdown[key].toFixed(2)));
    const note = el('p', { className: 'note muted' });
    const interested = el('button', { className: 'primary', text: match.my_interest ? '✓ Interested' : '⚡ Interested', attrs: { type: 'button' } });
    const pass = el('button', { className: 'secondary', text: 'Pass', attrs: { type: 'button' } });
    interested.disabled = match.my_interest;
    interested.addEventListener('click', () => decide(match.id, 'interested', note));
    pass.addEventListener('click', () => decide(match.id, 'pass', note));

    const card = el('article', { className: 'card match', attrs: { 'data-match-id': match.id } }, [
      el('div', { className: 'match-head' }, [el('strong', { text: who }), el('span', { className: 'score', text: `${match.composite_score}` })]),
      el('p', { text: match.complementary_summary }),
      el('div', { className: 'bars' }, breakdown),
      el('p', { className: 'note', text: `First conversation: ${match.suggested_first_collaboration}` }),
      el('p', { className: 'note muted', text: match.confidence_limitations }),
      el('div', { className: 'pills' }, match.evidence.map(evidencePill)),
    ]);
    if (match.their_interest && !match.my_interest) {
      card.appendChild(el('p', { className: 'note alert', text: `⚡ ${who} wants to connect with you! Tap Interested to unlock your Intro Room` }));
    }
    if (match.intro_state === 'completed') {
      card.appendChild(el('a', { className: 'pill', text: '🔓 Open Intro Room', attrs: { href: `/me/matches/${encodeURIComponent(match.id)}` } }));
    } else {
      card.appendChild(el('div', { className: 'actions' }, [interested, pass]));
    }
    card.appendChild(note);
    return card;
  }

  /**
   * Renders the top matches.
   * @param {object[]} matches - Up to three matches.
   */
  function renderMatches(matches) {
    const box = document.getElementById('matches');
    if (!matches.length) {
      box.replaceChildren(el('p', { className: 'muted', text: 'Matches appear here as soon as they are found.' }));
      return;
    }
    box.replaceChildren(...matches.map(matchCard));
  }

  /**
   * Renders the whole dashboard.
   * @param {object} data - `/api/me` payload.
   */
  function render(data) {
    myAlias = data.participant.display_alias;
    cursor = Math.max(cursor, data.latest_seq_id || 0);
    document.getElementById('alias').textContent = data.participant.display_alias;
    document.getElementById('handle').textContent = `@${data.participant.github_username}`;
    renderProgress(data.progress);
    renderFingerprint(data.fingerprint);
    renderPills('offers', data.offers, 'claims', (o) => o.name);
    renderPills('needs', data.needs, 'needs', (n) => n.summary);
    renderMatches(data.matches);
  }

  /**
   * Fetches and renders `/api/me`; a signed-out visitor goes to `/join`.
   * @returns {Promise<void>}
   */
  async function load() {
    const res = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' });
    if (res.status === 401) {
      window.location.assign('/join');
      return;
    }
    render(await res.json());
  }

  /** Re-fetches the dashboard shortly, coalescing bursts of events. */
  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      load().catch(() => {});
    }, REFRESH_DEBOUNCE_MS);
  }

  /**
   * Whether a public event concerns this participant.
   * @param {{payload?: Record<string, unknown>}} event - Public event envelope.
   * @returns {boolean} True when it names this participant's alias.
   */
  function concernsMe(event) {
    const p = (event && event.payload) || {};
    return Boolean(myAlias) && (p.display_alias === myAlias || p.display_alias_a === myAlias || p.display_alias_b === myAlias);
  }

  /**
   * Handles one public event from SSE or polling.
   * @param {{seq_id: number}} event - Envelope.
   */
  function onEvent(event) {
    if (typeof event.seq_id === 'number') cursor = Math.max(cursor, event.seq_id);
    if (concernsMe(event)) scheduleRefresh();
  }

  /** Polls `/api/events/poll` when SSE is unavailable. */
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/events/poll?after=${cursor}`, { cache: 'no-store' });
        const body = await res.json();
        for (const event of body.events || []) onEvent(event);
        cursor = Math.max(cursor, body.latest_seq_id || 0);
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
  }

  /** Subscribes to live events, falling back to polling. */
  function startLive() {
    if (typeof EventSource !== 'function') {
      startPolling();
      return;
    }
    const source = new EventSource(`/api/events/stream?after=${cursor}`);
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    source.onerror = () => {
      source.close();
      startPolling();
    };
  }

  /**
   * Sends an Interested/Pass decision; the tap that completes a mutual intro opens the room.
   * @param {string} matchId - Match id.
   * @param {'interested'|'pass'} decision - Decision.
   * @param {HTMLElement} note - Where to report the outcome.
   * @returns {Promise<void>}
   */
  async function decide(matchId, decision, note) {
    note.textContent = '';
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ decision }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        note.textContent = body.message || 'That did not go through — please try again.';
        return;
      }
      if (body.room) {
        window.location.assign(body.room);
        return;
      }
      await load();
    } catch {
      note.textContent = 'Network trouble — please try again.';
    }
  }

  /**
   * Dismisses an inaccurate AI inference about this participant.
   * @param {'claims'|'needs'} kind - Record kind.
   * @param {string} id - Record id.
   * @returns {Promise<void>}
   */
  async function dismiss(kind, id) {
    try {
      await fetch(`/api/me/${kind}/${encodeURIComponent(id)}/dismiss`, { method: 'POST', credentials: 'same-origin' });
    } finally {
      await load().catch(() => {});
    }
  }

  /**
   * Two-tap withdrawal: the first tap arms, the second deletes the participant's data.
   * @returns {Promise<void>}
   */
  async function withdraw() {
    const note = document.getElementById('withdraw-note');
    const button = document.getElementById('withdraw');
    if (!withdrawArmed) {
      withdrawArmed = true;
      button.textContent = 'Tap again to permanently delete my data';
      note.textContent = 'This removes your profile, matches and stage card.';
      return;
    }
    button.disabled = true;
    try {
      const res = await fetch('/api/participants/me', { method: 'DELETE', credentials: 'same-origin' });
      if (res.status === 204 || res.status === 401) {
        window.location.assign('/join');
        return;
      }
      note.textContent = 'Could not delete right now — please try again.';
    } catch {
      note.textContent = 'Network trouble — please try again.';
    } finally {
      button.disabled = false;
    }
  }

  document.getElementById('withdraw').addEventListener('click', withdraw);
  load().then(startLive, startPolling);
})();
