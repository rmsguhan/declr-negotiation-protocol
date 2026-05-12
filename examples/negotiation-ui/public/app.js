const buyerId = 'did:declr:buyer-demo';
const sellerId = 'did:declr:seller-demo';

/** @type {string | null} */
let contextId = null;

const el = (id) => {
  const n = document.getElementById(id);
  if (!n) throw new Error(`missing #${id}`);
  return n;
};

function buildDnp() {
  const round = Math.max(1, parseInt(el('round').value, 10) || 1);
  const price = parseFloat(el('price').value);
  const qty = Math.max(1, parseInt(el('qty').value, 10) || 1);
  const dmin = parseInt(el('dmin').value, 10);
  const dmax = parseInt(el('dmax').value, 10);
  const deliveryMethod = el('method').value;
  const messageType = el('msgType').value;

  return {
    dnpVersion: '0.1.0',
    messageType,
    catalogItemRef: {
      itemId: 'DECLR-ITEM-DEMO',
      itemType: 'Offer',
      catalogUrl: 'https://catalog.declr.app/items/DECLR-ITEM-DEMO',
    },
    senderAgentId: buyerId,
    recipientAgentId: sellerId,
    negotiationState: {
      roundNumber: round,
      parameters: {
        price: { value: price, currency: 'USD' },
        deliverySpeedDays: { min: Math.min(dmin, dmax), max: Math.max(dmin, dmax) },
        deliveryMethod,
        quantity: qty,
      },
      proposedBy: buyerId,
    },
    context: {
      rationale: 'Buyer message from negotiation-ui.',
      escalationReason: null,
      humanApprovalRequired: false,
    },
    metadata: {
      extensions: [],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  };
}

/** Copy seller terms into the form; buyer’s next wire message stays buyer-typed. */
function applySellerTermsToForm(dnp) {
  const p = dnp.negotiationState.parameters;
  el('round').value = String(dnp.negotiationState.roundNumber + 1);
  el('msgType').value = dnp.messageType === 'accept' ? 'accept' : 'counter';
  el('price').value = String(p.price.value);
  el('qty').value = String(p.quantity);
  el('method').value = p.deliveryMethod;
  el('dmin').value = String(p.deliverySpeedDays.min);
  el('dmax').value = String(p.deliverySpeedDays.max);
}

function msgBlock(role, title, oneLine, jsonObj) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const preJson = JSON.stringify(jsonObj, null, 2);
  wrap.innerHTML = `
    <div class="tag">${title}</div>
    <p class="one-line"></p>
    <details>
      <summary>Full JSON</summary>
      <pre></pre>
    </details>
  `;
  wrap.querySelector('.one-line').textContent = oneLine;
  wrap.querySelector('pre').textContent = preJson;
  return wrap;
}

function appendTurn(buyerDnp, sellerSummary, sellerDnp, sellerTexts) {
  const timeline = el('timeline');
  const empty = timeline.querySelector('.empty');
  if (empty) empty.remove();

  const turn = document.createElement('div');
  turn.className = 'turn';
  turn.appendChild(
    msgBlock('buyer', 'Buyer → seller', summarizeLocal(buyerDnp), buyerDnp),
  );
  const sellerJson = sellerDnp ?? { note: 'No DNP data part', textParts: sellerTexts ?? [] };
  turn.appendChild(
    msgBlock(
      'seller',
      'Seller → you',
      sellerSummary || '(no summary)',
      sellerJson,
    ),
  );
  timeline.appendChild(turn);
  timeline.scrollTop = timeline.scrollHeight;
}

function summarizeLocal(dnp) {
  const p = dnp.negotiationState.parameters;
  return `round ${dnp.negotiationState.roundNumber} · ${dnp.messageType} · $${p.price.value} ${p.price.currency} · qty ${p.quantity} · ${p.deliveryMethod} · ${p.deliverySpeedDays.min}–${p.deliverySpeedDays.max}d`;
}

function setStatus(text, isErr = false) {
  const s = el('status');
  s.textContent = text;
  s.classList.toggle('err', isErr);
}

async function send() {
  const sendBtn = el('send');
  sendBtn.disabled = true;
  setStatus('Calling seller…');
  try {
    const dnp = buildDnp();
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dnp,
        contextId: contextId ?? undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      setStatus(data.error ? JSON.stringify(data.error) : res.statusText, true);
      return;
    }
    contextId = data.contextId;
    appendTurn(dnp, data.agentSummary, data.dnp, data.textParts);
    if (data.dnp) {
      applySellerTermsToForm(data.dnp);
    } else {
      const r = parseInt(el('round').value, 10) || 1;
      el('round').value = String(r + 1);
    }
    setStatus('Ready.');
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), true);
  } finally {
    sendBtn.disabled = false;
  }
}

function resetThread() {
  contextId = null;
  el('round').value = '1';
  el('msgType').value = 'proposal';
  el('price').value = '135';
  el('qty').value = '1';
  el('method').value = 'postal';
  el('dmin').value = '3';
  el('dmax').value = '6';
  const timeline = el('timeline');
  timeline.innerHTML = '<p class="empty">Send a proposal to see the seller reply here.</p>';
  setStatus('New thread. Adjust terms and send.');
}

el('send').addEventListener('click', () => void send());
el('reset').addEventListener('click', resetThread);
resetThread();
