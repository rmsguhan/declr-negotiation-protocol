const el = (id) => {
  const n = document.getElementById(id);
  if (!n) throw new Error(`missing #${id}`);
  return n;
};

/** @type {string | null} */
let focusThreadId = null;
/** @type {string | null} */
let sellerViewThreadId = null;
/** @type {{ buyerAgentId: string; sellerAgentId: string } | null} */
let buyerThreadIds = null;
/** @type {{ buyerAgentId: string; sellerAgentId: string } | null} */
let sellerThreadIds = null;

/** @param {HTMLElement} host */
function renderPayloadCard(host, { summary, json, emptyText, variant = '' }) {
  if (!summary && json === undefined) {
    host.className = 'card-body empty-state';
    host.textContent = emptyText;
    return;
  }
  host.className = `card-body${variant ? ` ${variant}` : ''}`;
  const jsonStr = json !== undefined && json !== null ? JSON.stringify(json, null, 2) : '';
  if (jsonStr) {
    host.innerHTML = `
      <p class="summary-line"></p>
      <details>
        <summary>Full payload</summary>
        <pre></pre>
      </details>
    `;
    host.querySelector('.summary-line').textContent = summary;
    host.querySelector('pre').textContent = jsonStr;
  } else {
    host.innerHTML = `<p class="summary-line"></p>`;
    host.querySelector('.summary-line').textContent = summary;
  }
}

function summarizeDnp(dnp) {
  const p = dnp.negotiationState.parameters;
  return `Round ${String(dnp.negotiationState.roundNumber)} · ${dnp.messageType} · $${String(p.price.value)} ${p.price.currency} · qty ${String(p.quantity)} · ${p.deliveryMethod} · ${String(p.deliverySpeedDays.min)}–${String(p.deliverySpeedDays.max)}d`;
}

function setStatus(text, isErr = false) {
  const s = el('status');
  s.textContent = text;
  s.classList.toggle('err', isErr);
}

function syncModeControls() {
  const locked =
    focusThreadId !== null &&
    (threadsCache.find((t) => t.threadId === focusThreadId)?.modesLocked ?? false);
  el('buyer-mode').disabled = locked;
  el('seller-mode').disabled = locked;
  el('mode-lock-hint').textContent = locked
    ? 'Modes are locked for this thread.'
    : 'Modes apply on the first buyer send for this thread, then lock.';
}

/** @type {Array<Record<string, unknown>>} */
let threadsCache = [];

async function fetchThreads() {
  const res = await fetch('/api/threads');
  const data = await res.json();
  if (!data.ok) throw new Error('threads_list_failed');
  threadsCache = data.threads;
  const sel = el('focus-thread');
  const prev = focusThreadId;
  sel.innerHTML = threadsCache
    .map(
      (t) =>
        `<option value="${t.threadId}">${String(t.threadId).slice(0, 8)}… · B:${t.buyerMode[0].toUpperCase()} S:${t.sellerMode[0].toUpperCase()}${t.pendingHumanSeller ? ' · PENDING' : ''}</option>`,
    )
    .join('');
  if (threadsCache.length === 0) {
    focusThreadId = null;
    buyerThreadIds = null;
    return;
  }
  if (prev && threadsCache.some((t) => t.threadId === prev)) {
    sel.value = prev;
    focusThreadId = prev;
  } else {
    sel.value = threadsCache[threadsCache.length - 1].threadId;
    focusThreadId = sel.value;
  }
}

async function fetchThreadDetail(threadId) {
  const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}`);
  if (!res.ok) throw new Error(`thread ${threadId}`);
  return await res.json();
}

function renderThreadRail() {
  const ul = el('seller-thread-list');
  ul.innerHTML = '';
  for (const t of threadsCache) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thread-chip' + (t.threadId === sellerViewThreadId ? ' active' : '');
    btn.innerHTML = `<span class="chip-id">${String(t.threadId).slice(0, 8)}…</span><br />
      B ${t.buyerMode} · S ${t.sellerMode}${t.pendingHumanSeller ? '<span class="chip-pend"> · NEEDS SELLER</span>' : ''}`;
    btn.addEventListener('click', () => {
      sellerViewThreadId = t.threadId;
      void hydrateSellerFromServer();
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function renderHistoriesFromServer(history, buyerList, sellerList) {
  if (buyerList) {
    buyerList.innerHTML = '';
    for (const entry of history) {
      const b = entry.buyer;
      const s = entry.seller;
      const st = entry.sellerText;
      const bli = document.createElement('li');
      bli.className = 'hist-turn';
      bli.innerHTML = `
      <div class="row out"><span class="hist-meta">Buyer sent</span><span class="hist-line b1"></span></div>
      <div class="row in"><span class="hist-meta">Seller</span><span class="hist-line b2"></span></div>`;
      bli.querySelector('.b1').textContent = summarizeDnp(b);
      const b2 = bli.querySelector('.b2');
      if (s) {
        b2.textContent = summarizeDnp(s);
      } else if (st) {
        b2.textContent = st;
        b2.style.color = 'var(--danger)';
      } else {
        b2.textContent = '… awaiting seller …';
        b2.style.color = 'var(--muted)';
      }
      buyerList.appendChild(bli);
    }
    buyerList.scrollTop = buyerList.scrollHeight;
  }
  if (sellerList) {
    sellerList.innerHTML = '';
    for (const entry of history) {
      const b = entry.buyer;
      const s = entry.seller;
      const st = entry.sellerText;
      const sli = document.createElement('li');
      sli.className = 'hist-turn';
      sli.innerHTML = `
      <div class="row in"><span class="hist-meta">Inbound buyer</span><span class="hist-line s1"></span></div>
      <div class="row out"><span class="hist-meta">Seller reply</span><span class="hist-line s2"></span></div>`;
      sli.querySelector('.s1').textContent = summarizeDnp(b);
      const s2 = sli.querySelector('.s2');
      if (s) {
        s2.textContent = summarizeDnp(s);
      } else if (st) {
        s2.textContent = st;
        s2.style.color = 'var(--danger)';
      } else {
        s2.textContent = '… pending human seller …';
        s2.style.color = 'var(--warn)';
      }
      sellerList.appendChild(sli);
    }
    sellerList.scrollTop = sellerList.scrollHeight;
  }
}

function applySellerTermsToBuyerForm(dnp) {
  const p = dnp.negotiationState.parameters;
  el('round').value = String(dnp.negotiationState.roundNumber + 1);
  el('msgType').value = dnp.messageType === 'accept' ? 'accept' : 'counter';
  el('price').value = String(p.price.value);
  el('qty').value = String(p.quantity);
  el('method').value = p.deliveryMethod;
  el('dmin').value = String(p.deliverySpeedDays.min);
  el('dmax').value = String(p.deliverySpeedDays.max);
}

function applyInboundToSellerHumanForm(dnp) {
  const p = dnp.negotiationState.parameters;
  el('s-round').value = String(dnp.negotiationState.roundNumber + 1);
  el('s-msgType').value = 'counter';
  el('s-price').value = String(Math.min(Math.max(p.price.value, 115), 250));
  el('s-qty').value = String(p.quantity);
  el('s-method').value = p.deliveryMethod;
  el('s-dmin').value = String(p.deliverySpeedDays.min);
  el('s-dmax').value = String(p.deliverySpeedDays.max);
}

function buildDnpFromBuyerForm() {
  if (buyerThreadIds === null) throw new Error('no_thread');
  const round = Math.max(1, parseInt(el('round').value, 10) || 1);
  const price = parseFloat(el('price').value);
  const qty = Math.max(1, parseInt(el('qty').value, 10) || 1);
  const dmin = parseInt(el('dmin').value, 10);
  const dmax = parseInt(el('dmax').value, 10);
  return {
    dnpVersion: '0.1.0',
    messageType: el('msgType').value,
    catalogItemRef: {
      itemId: 'DECLR-ITEM-DEMO',
      itemType: 'Offer',
      catalogUrl: 'https://catalog.declr.app/items/DECLR-ITEM-DEMO',
    },
    senderAgentId: buyerThreadIds.buyerAgentId,
    recipientAgentId: buyerThreadIds.sellerAgentId,
    negotiationState: {
      roundNumber: round,
      parameters: {
        price: { value: price, currency: 'USD' },
        deliverySpeedDays: { min: Math.min(dmin, dmax), max: Math.max(dmin, dmax) },
        deliveryMethod: el('method').value,
        quantity: qty,
      },
      proposedBy: buyerThreadIds.buyerAgentId,
    },
    context: {
      rationale: 'Buyer message (negotiation-ui).',
      escalationReason: null,
      humanApprovalRequired: false,
    },
    metadata: {
      extensions: [],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  };
}

function buildDnpFromSellerHumanForm() {
  if (sellerThreadIds === null) throw new Error('no_thread');
  const round = Math.max(1, parseInt(el('s-round').value, 10) || 1);
  const price = parseFloat(el('s-price').value);
  const qty = Math.max(1, parseInt(el('s-qty').value, 10) || 1);
  const dmin = parseInt(el('s-dmin').value, 10);
  const dmax = parseInt(el('s-dmax').value, 10);
  return {
    dnpVersion: '0.1.0',
    messageType: el('s-msgType').value,
    catalogItemRef: {
      itemId: 'DECLR-ITEM-DEMO',
      itemType: 'Offer',
      catalogUrl: 'https://catalog.declr.app/items/DECLR-ITEM-DEMO',
    },
    senderAgentId: sellerThreadIds.sellerAgentId,
    recipientAgentId: sellerThreadIds.buyerAgentId,
    negotiationState: {
      roundNumber: round,
      parameters: {
        price: { value: price, currency: 'USD' },
        deliverySpeedDays: { min: Math.min(dmin, dmax), max: Math.max(dmin, dmax) },
        deliveryMethod: el('s-method').value,
        quantity: qty,
      },
      proposedBy: sellerThreadIds.sellerAgentId,
    },
    context: {
      rationale: 'Human seller reply (negotiation-ui).',
      escalationReason: null,
      humanApprovalRequired: false,
    },
    metadata: {
      extensions: [],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  };
}

/**
 * @param {unknown} lastBuyer
 * @param {unknown} lastSeller
 */
function buildAgenticBuyerDnp(lastBuyer, lastSeller) {
  if (!lastBuyer || typeof lastBuyer !== 'object') return null;
  if (!lastSeller || typeof lastSeller !== 'object') return null;
  const ls = /** @type {Record<string, unknown>} */ (lastSeller);
  if (ls.messageType === 'accept') return null;
  const lsn = ls.negotiationState;
  if (!lsn || typeof lsn !== 'object') return null;
  const params = /** @type {Record<string, unknown>} */ (lsn).parameters;
  if (!params || typeof params !== 'object') return null;
  const priceObj = /** @type {Record<string, unknown>} */ (params).price;
  const sellerPrice =
    priceObj && typeof priceObj === 'object' && typeof priceObj.value === 'number'
      ? priceObj.value
      : 135;
  const nextPrice = Math.min(Math.max(sellerPrice - 3, 112), 255);
  const round = typeof lsn.roundNumber === 'number' ? lsn.roundNumber + 1 : 2;
  if (!buyerThreadIds) return null;
  const base = /** @type {Record<string, unknown>} */ (JSON.parse(JSON.stringify(lastBuyer)));
  base.messageType = 'counter';
  base.senderAgentId = buyerThreadIds.buyerAgentId;
  base.recipientAgentId = buyerThreadIds.sellerAgentId;
  const ns = /** @type {Record<string, unknown>} */ (base.negotiationState);
  const pr = /** @type {Record<string, unknown>} */ (ns.parameters);
  ns.roundNumber = round;
  ns.proposedBy = buyerThreadIds.buyerAgentId;
  pr.price = { value: nextPrice, currency: 'USD' };
  return base;
}

async function hydrateBuyerFromServer() {
  if (focusThreadId === null) {
    buyerThreadIds = null;
    el('buyer-thread-meta').textContent = 'Create a thread to begin.';
    renderPayloadCard(el('buyer-received'), {
      summary: '',
      json: undefined,
      emptyText: 'No thread selected.',
    });
    return;
  }
  const detail = await fetchThreadDetail(focusThreadId);
  const t = detail.thread;
  buyerThreadIds = { buyerAgentId: t.buyerAgentId, sellerAgentId: t.sellerAgentId };
  el('buyer-thread-meta').textContent = `Thread ${t.threadId} · buyer ${t.buyerMode} · seller ${t.sellerMode}`;
  el('buyer-mode').value = t.buyerMode;
  el('seller-mode').value = t.sellerMode;
  syncModeControls();

  const hist = detail.history ?? [];
  const last = hist[hist.length - 1];
  if (last?.seller) {
    renderPayloadCard(el('buyer-received'), {
      summary: summarizeDnp(last.seller),
      json: last.seller,
      emptyText: '',
    });
    applySellerTermsToBuyerForm(last.seller);
  } else if (last?.sellerText) {
    renderPayloadCard(el('buyer-received'), {
      summary: last.sellerText,
      json: { note: last.sellerText },
      emptyText: '',
      variant: 'err',
    });
  } else {
    renderPayloadCard(el('buyer-received'), {
      summary: '',
      json: undefined,
      emptyText: 'No seller reply yet for this turn.',
    });
  }

  renderHistoriesFromServer(hist, el('buyer-history'), null);

  const buyerAgentic = t.buyerMode === 'agentic';
  el('buyer-compose-fields').classList.toggle('hidden', buyerAgentic);
  el('buyer-compose-hint').textContent = buyerAgentic
    ? 'Agentic buyer: the demo auto-sends a counter after each seller message (stops on accept).'
    : 'Human buyer: edit fields and send.';
}

async function hydrateSellerFromServer() {
  const tid = sellerViewThreadId ?? focusThreadId;
  if (tid === null) {
    sellerThreadIds = null;
    el('seller-thread-meta').textContent = '';
    renderPayloadCard(el('seller-received'), {
      summary: '',
      json: undefined,
      emptyText: 'No thread selected.',
    });
    return;
  }
  const detail = await fetchThreadDetail(tid);
  const t = detail.thread;
  sellerThreadIds = { buyerAgentId: t.buyerAgentId, sellerAgentId: t.sellerAgentId };
  el('seller-thread-meta').textContent = `Viewing ${t.threadId} · B:${t.buyerMode} · S:${t.sellerMode}`;

  const hist = detail.history ?? [];
  const last = hist[hist.length - 1];
  const pending = detail.pendingHumanSellerInbound;

  if (last?.buyer) {
    renderPayloadCard(el('seller-received'), {
      summary: summarizeDnp(last.buyer),
      json: last.buyer,
      emptyText: '',
    });
  } else {
    renderPayloadCard(el('seller-received'), {
      summary: '',
      json: undefined,
      emptyText: 'No buyer message yet.',
    });
  }

  const automated = el('seller-automated');
  const humanWrap = el('seller-human-compose');
  const outHint = el('seller-out-hint');

  if (t.sellerMode === 'human' && pending) {
    outHint.textContent = 'Human seller mode — compose below.';
    humanWrap.classList.remove('hidden');
    applyInboundToSellerHumanForm(pending);
    renderPayloadCard(automated, {
      summary: '',
      json: undefined,
      emptyText: 'Automated reply is skipped until you send.',
    });
  } else {
    humanWrap.classList.add('hidden');
    outHint.textContent =
      t.sellerMode === 'agentic'
        ? 'Agentic seller: last reply was generated by the orchestrator.'
        : 'Human seller with no pending inbound.';
    if (last?.seller) {
      renderPayloadCard(automated, {
        summary: summarizeDnp(last.seller) + ' (last outbound)',
        json: last.seller,
        emptyText: '',
      });
    } else if (last?.sellerText) {
      renderPayloadCard(automated, {
        summary: last.sellerText,
        json: { detail: last.sellerText },
        emptyText: '',
        variant: 'err',
      });
    } else {
      renderPayloadCard(automated, {
        summary: '',
        json: undefined,
        emptyText: 'No automated outbound yet.',
      });
    }
  }

  renderHistoriesFromServer(hist, null, el('seller-history'));
  renderThreadRail();
}

async function postBuyerMessage(dnp, opts = {}) {
  if (focusThreadId === null) {
    setStatus('Create a thread first.', true);
    return null;
  }
  const body = {
    dnp,
    ...(opts.includeModes
      ? { buyerMode: el('buyer-mode').value, sellerMode: el('seller-mode').value }
      : {}),
  };
  const res = await fetch(`/api/threads/${encodeURIComponent(focusThreadId)}/buyer-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    setStatus(typeof data.error === 'string' ? data.error : JSON.stringify(data.error), true);
    return null;
  }
  return data;
}

async function postSellerHuman(dnp) {
  const tid = sellerViewThreadId ?? focusThreadId;
  if (tid === null) return null;
  const res = await fetch(`/api/threads/${encodeURIComponent(tid)}/seller-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dnp }),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    setStatus(typeof data.error === 'string' ? data.error : JSON.stringify(data.error), true);
    return null;
  }
  return data;
}

let agenticDepth = 0;

async function runAfterBuyerResponse(data) {
  await fetchThreads();
  syncModeControls();
  await hydrateBuyerFromServer();
  sellerViewThreadId = focusThreadId;
  await hydrateSellerFromServer();

  if (!data || focusThreadId === null) return;

  const tmeta = threadsCache.find((x) => x.threadId === focusThreadId);
  if (!tmeta) return;

  if (tmeta.buyerMode === 'agentic' && !data.awaitingSellerHuman && data.dnp && data.dnp.messageType !== 'accept') {
    if (agenticDepth > 12) {
      setStatus('Agentic buyer stopped (max depth).');
      return;
    }
    agenticDepth += 1;
    const detail = await fetchThreadDetail(focusThreadId);
    const last = detail.history[detail.history.length - 1];
    const next = buildAgenticBuyerDnp(last.buyer, last.seller);
    if (next) {
      setStatus('Agentic buyer sending…');
      await new Promise((r) => setTimeout(r, 450));
      const d2 = await postBuyerMessage(next, { includeModes: false });
      agenticDepth -= 1;
      if (d2) await runAfterBuyerResponse(d2);
    } else {
      agenticDepth = 0;
      setStatus('Agentic buyer finished (accept or no move).');
    }
  } else {
    agenticDepth = 0;
  }
}

async function onSendBuyer() {
  el('send-buyer').disabled = true;
  setStatus('Sending…');
  try {
    const dnp = buildDnpFromBuyerForm();
    const meta = threadsCache.find((t) => t.threadId === focusThreadId);
    const includeModes = meta && !meta.modesLocked;
    const data = await postBuyerMessage(dnp, { includeModes: Boolean(includeModes) });
    if (data) {
      setStatus(data.awaitingSellerHuman ? 'Awaiting human seller on this thread.' : 'Ready.');
      await runAfterBuyerResponse(data);
    }
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), true);
  } finally {
    el('send-buyer').disabled = false;
  }
}

async function onSendSellerHuman() {
  el('send-seller').disabled = true;
  setStatus('Publishing seller reply…');
  try {
    const tid = sellerViewThreadId ?? focusThreadId;
    if (tid === null) return;
    const dnp = buildDnpFromSellerHumanForm();
    const data = await postSellerHuman(dnp);
    if (data) {
      focusThreadId = tid;
      sellerViewThreadId = tid;
      el('focus-thread').value = tid;
      setStatus('Seller reply sent.');
      await runAfterBuyerResponse({
        ok: true,
        awaitingSellerHuman: false,
        dnp: data.dnp,
      });
    }
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), true);
  } finally {
    el('send-seller').disabled = false;
  }
}

async function onNewThread() {
  const res = await fetch('/api/threads', { method: 'POST' });
  const data = await res.json();
  if (!data.ok) {
    setStatus('Failed to create thread', true);
    return;
  }
  focusThreadId = data.thread.threadId;
  sellerViewThreadId = focusThreadId;
  el('focus-thread').value = focusThreadId;
  await fetchThreads();
  el('focus-thread').value = focusThreadId;
  syncModeControls();
  setStatus('New thread — set modes if you like, then send first buyer message.');
  await hydrateBuyerFromServer();
  await hydrateSellerFromServer();
}

el('new-thread').addEventListener('click', () => void onNewThread());
el('refresh-threads').addEventListener('click', async () => {
  await fetchThreads();
  renderThreadRail();
  syncModeControls();
  setStatus('Threads refreshed.');
});
el('focus-thread').addEventListener('change', async () => {
  focusThreadId = el('focus-thread').value || null;
  sellerViewThreadId = focusThreadId;
  await hydrateBuyerFromServer();
  await hydrateSellerFromServer();
});
el('send-buyer').addEventListener('click', () => void onSendBuyer());
el('send-seller').addEventListener('click', () => void onSendSellerHuman());

void (async function init() {
  await fetchThreads();
  renderThreadRail();
  if (threadsCache.length > 0) {
    focusThreadId = el('focus-thread').value;
    sellerViewThreadId = focusThreadId;
    await hydrateBuyerFromServer();
    await hydrateSellerFromServer();
  } else {
    el('buyer-thread-meta').textContent = 'Click “New buyer thread” to start.';
    syncModeControls();
  }
  setStatus('Ready.');
})();
