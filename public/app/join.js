// Ariadne /join — submits the onboarding form to POST /api/participants and handles capacity.
(() => {
  const form = document.getElementById('join-form');
  const capacity = document.getElementById('capacity');
  const capacityMessage = document.getElementById('capacity-message');
  const submit = document.getElementById('submit');
  const status = document.getElementById('status');
  const fields = ['github', 'website_url', 'goal'];
  let guestEntry = false;

  /**
   * Shows the capacity notice in place of the form, unless a pre-registered guest has asked for the form.
   * @param {string} message - Notice text from the server.
   */
  function showCapacity(message) {
    capacityMessage.textContent = message;
    capacity.hidden = false;
    form.hidden = !guestEntry;
  }

  /** Opens the form under the capacity notice for pre-registered (pre-warmed) judges and guests. */
  function openGuestEntry() {
    guestEntry = true;
    form.hidden = false;
    document.getElementById('github').focus();
  }

  /** Shows the form again. */
  function showForm() {
    capacity.hidden = true;
    form.hidden = false;
  }

  /** Clears every inline field error and the status line. */
  function clearErrors() {
    for (const name of fields) document.getElementById(`${name}-error`).textContent = '';
    status.textContent = '';
  }

  /**
   * Asks the server whether the room is open and shows the notice or the form.
   * @returns {Promise<void>}
   */
  async function checkAdmission() {
    try {
      const res = await fetch('/api/participants/admission', { cache: 'no-store' });
      const body = await res.json();
      if (body.open) showForm();
      else showCapacity(body.message);
    } catch {
      showForm();
    }
  }

  /**
   * Submits the form as JSON and follows the outcome.
   * @param {SubmitEvent} event - Form submission.
   * @returns {Promise<void>}
   */
  async function onSubmit(event) {
    event.preventDefault();
    clearErrors();
    submit.disabled = true;
    status.textContent = 'Joining…';
    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          github: document.getElementById('github').value,
          website_url: document.getElementById('website_url').value,
          goal: document.getElementById('goal').value,
          consent_processing: true,
          stage_display_consent: document.getElementById('stage_display_consent').checked,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.assign(body.redirect || '/me');
        return;
      }
      if (body.error === 'room_at_capacity') {
        showCapacity(body.message);
        if (guestEntry) status.textContent = `${body.message} That handle is not on the pre-registered list.`;
      } else if (body.field && fields.includes(body.field)) {
        document.getElementById(`${body.field}-error`).textContent = body.message;
        status.textContent = '';
      } else {
        status.textContent = body.message || 'Something went wrong — please try again.';
      }
    } catch {
      status.textContent = 'Network trouble — please try again.';
    } finally {
      submit.disabled = false;
    }
  }

  form.addEventListener('submit', onSubmit);
  document.getElementById('retry').addEventListener('click', checkAdmission);
  document.getElementById('prewarm-entry').addEventListener('click', openGuestEntry);
  checkAdmission();
})();
