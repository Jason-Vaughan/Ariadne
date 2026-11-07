// Ariadne private intro room (/me/matches/:id). All values are written as text; links only for https URLs.
(() => {
  const POLL_MS = 3000;
  const matchId = decodeURIComponent(window.location.pathname.split('/').filter(Boolean).pop() || '');
  const api = `/api/matches/${encodeURIComponent(matchId)}`;
  let room = null;
  let pollTimer = null;

  /**
   * Creates an element with text and attributes.
   * @param {string} tag - Tag name.
   * @param {{className?: string, text?: string, attrs?: Record<string, string>}} [opts] - Content.
   * @returns {HTMLElement} The element.
   */
  function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text !== undefined) node.textContent = opts.text;
    for (const [name, value] of Object.entries(opts.attrs || {})) node.setAttribute(name, value);
    return node;
  }

  /**
   * A link pill, or plain text when the URL is not https.
   * @param {string} label - Text.
   * @param {string|null} url - Target.
   * @returns {HTMLElement} The pill.
   */
  function linkPill(label, url) {
    if (typeof url !== 'string' || !url.startsWith('https://')) return el('span', { className: 'pill', text: label });
    return el('a', { className: 'pill', text: label, attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' } });
  }

  /**
   * The text copied by "Copy Intro".
   * @param {object} data - Room payload.
   * @returns {string} A shareable intro.
   */
  function introText(data) {
    const c = data.counterpart;
    return [
      `Met @${c.github_username} via Ariadne.`,
      c.github_url,
      c.website_url || '',
      `First conversation: ${data.icebreaker.suggested_first_collaboration}`,
    ].filter(Boolean).join('\n');
  }

  /**
   * Renders the unlocked room.
   * @param {object} data - Room payload from the API.
   */
  function render(data) {
    room = data;
    document.getElementById('locked').hidden = true;
    document.getElementById('room').hidden = false;
    const c = data.counterpart;
    document.getElementById('title').textContent = `You're connected with @${c.github_username}!`;
    document.getElementById('counterpart').textContent = `@${c.github_username} (${c.display_alias})`;
    const links = [linkPill('GitHub', c.github_url)];
    if (c.website_url) links.push(linkPill('Website', c.website_url));
    document.getElementById('links').replaceChildren(...links);
    document.getElementById('contact-card').textContent = c.contact_card ? `Contact: ${c.contact_card}` : '';
    document.getElementById('vcard').setAttribute('href', `${api}/vcard`);
    document.getElementById('first-collab').textContent = data.icebreaker.suggested_first_collaboration;
    document.getElementById('thesis').textContent = data.icebreaker.complementary_summary;
    document.getElementById('projects').replaceChildren(
      ...data.icebreaker.relevant_projects.map((repo) => linkPill(repo, `https://github.com/${repo}`)),
    );
    document.getElementById('venues').replaceChildren(
      ...data.venue_options.map((option) => {
        const button = el('button', { className: 'pill', text: `📍 ${option.label}`, attrs: { type: 'button' } });
        button.addEventListener('click', () => post({ venue: option.key }));
        return button;
      }),
    );
    document.getElementById('notes').replaceChildren(
      ...data.notes.map((note) => el('li', { className: `chat-${note.author}`, text: `${note.author === 'me' ? 'You' : `@${c.github_username}`}: ${note.body}` })),
    );
  }

  /**
   * Shows the locked state.
   * @param {string} message - Why it is locked.
   */
  function showLocked(message) {
    document.getElementById('room').hidden = true;
    document.getElementById('locked').hidden = false;
    document.getElementById('locked-message').textContent = message;
  }

  /**
   * Loads the room; a signed-out visitor goes to `/join`.
   * @returns {Promise<void>}
   */
  async function load() {
    const res = await fetch(`${api}/room`, { cache: 'no-store', credentials: 'same-origin' });
    if (res.status === 401) {
      window.location.assign('/join');
      return;
    }
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      showLocked(body.error === 'room_locked' ? 'This room opens once you both tap Interested.' : 'This intro room belongs to someone else.');
      return;
    }
    if (!res.ok) {
      showLocked('This intro room could not be found.');
      return;
    }
    render(await res.json());
  }

  /**
   * Posts a chat message or venue pin, then shows the updated room.
   * @param {Record<string, string>} payload - `{ message }`, `{ venue }` or `{ venue: 'custom', venue_note }`.
   * @returns {Promise<boolean>} Whether it was accepted.
   */
  async function post(payload) {
    const status = document.getElementById('chat-status');
    status.textContent = '';
    try {
      const res = await fetch(`${api}/room`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        status.textContent = body.message || 'That did not send — please try again.';
        return false;
      }
      render(body);
      return true;
    } catch {
      status.textContent = 'Network trouble — please try again.';
      return false;
    }
  }

  document.getElementById('chat-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('chat-input');
    if (!input.value.trim()) return;
    if (await post({ message: input.value })) input.value = '';
  });

  document.getElementById('venue-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('venue-note');
    if (!input.value.trim()) return;
    if (await post({ venue: 'custom', venue_note: input.value })) input.value = '';
  });

  document.getElementById('copy').addEventListener('click', async () => {
    const status = document.getElementById('copy-status');
    if (!room) return;
    try {
      await navigator.clipboard.writeText(introText(room));
      status.textContent = 'Copied!';
    } catch {
      status.textContent = introText(room);
    }
  });

  load().catch(() => showLocked('Network trouble — please refresh.'));
  pollTimer = setInterval(() => {
    if (room) load().catch(() => {});
  }, POLL_MS);
})();
