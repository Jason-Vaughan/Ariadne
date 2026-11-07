/**
 * Stage hotkeys. Global keys work in every view; arrow keys and N/B step the Match Spotlight
 * only while View 4 is showing (P stays the privacy override everywhere).
 */
export const KEY_ACTIONS = {
  1: 'view:1',
  2: 'view:2',
  3: 'view:3',
  4: 'view:4',
  q: 'qr',
  a: 'qr:floating',
  s: 'seed',
  p: 'privacy',
  ' ': 'cycle',
};

const SPOTLIGHT_KEYS = { arrowright: 'spotlight:next', n: 'spotlight:next', arrowleft: 'spotlight:prev', b: 'spotlight:prev' };

/**
 * The action a key press triggers on stage.
 * @param {{key:string,metaKey?:boolean,ctrlKey?:boolean,altKey?:boolean}} event
 * @param {string} view the view currently showing
 * @returns {string|null}
 */
export function actionForKey(event, view) {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (view === '4' && SPOTLIGHT_KEYS[key]) return SPOTLIGHT_KEYS[key];
  return KEY_ACTIONS[key] ?? null;
}

/**
 * Text for the operator HUD: room fill, intake, live channel and the active modes.
 * @param {{admission:{max_room_capacity:number,intake_locked:boolean,live_builders:number},privacy_mode:boolean,presenter:boolean}} snapshot
 * @param {{channel:string,cycling:boolean}} status
 * @returns {Array<{text:string,tone:string}>}
 */
export function hudItems(snapshot, status) {
  const { live_builders: live, max_room_capacity: cap, intake_locked: locked } = snapshot.admission;
  const full = live >= cap;
  return [
    { text: `Room ${live}/${cap}`, tone: full ? 'warn' : 'ok' },
    { text: locked ? '🔒 Intake locked' : full ? 'Room full' : 'Intake open', tone: locked || full ? 'warn' : 'ok' },
    { text: `Live: ${status.channel}`, tone: 'muted' },
    ...(snapshot.privacy_mode ? [{ text: 'Privacy override ON', tone: 'warn' }] : []),
    ...(status.cycling ? [{ text: 'Auto-cycle ON', tone: 'ok' }] : []),
    ...(snapshot.presenter ? [] : [{ text: 'View-only screen', tone: 'muted' }]),
  ];
}

/**
 * Draw the operator HUD.
 * @param {HTMLElement} container
 * @param {Array<{text:string,tone:string}>} items
 */
export function renderHud(container, items) {
  container.replaceChildren(
    ...items.map((item) => {
      const span = document.createElement('span');
      span.className = `hud-item hud-${item.tone}`;
      span.textContent = item.text;
      return span;
    }),
  );
}

/**
 * Wire on-screen buttons (`data-action`) and hotkeys to the stage's action handler.
 * @param {Document} doc
 * @param {() => string} currentView
 * @param {(action:string) => void} dispatch
 */
export function bindControls(doc, currentView, dispatch) {
  for (const button of doc.querySelectorAll('[data-action]')) {
    button.addEventListener('click', () => dispatch(button.dataset.action));
  }
  doc.addEventListener('keydown', (event) => {
    const action = actionForKey(event, currentView());
    if (!action) return;
    event.preventDefault();
    dispatch(action);
  });
}
