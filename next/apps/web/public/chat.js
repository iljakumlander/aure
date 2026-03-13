/**
 * Aure chat client — vanilla JS, SSE-driven.
 */

const messagesEl = document.getElementById('messages');
const inputForm = document.getElementById('input-form');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
const cancelBtn = document.getElementById('cancel-btn');
const newChatBtn = document.getElementById('new-chat');

let conversationId = null;
let eventSource = null;
let isStreaming = false;

// Auto-resize textarea
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

// Submit on Enter (Shift+Enter for newline)
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    inputForm.dispatchEvent(new Event('submit'));
  }
});

// Send message
inputForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = inputEl.value.trim();
  if (!content || !conversationId) return;

  inputEl.value = '';
  inputEl.style.height = 'auto';
  appendMessage('visitor', content);

  try {
    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    appendMessage('assistant', 'Failed to send message.', 'error');
  }
});

// Cancel
cancelBtn.addEventListener('click', async () => {
  if (!conversationId) return;
  await fetch(`/api/conversations/${conversationId}/cancel`, { method: 'POST' });
});

// New chat
newChatBtn.addEventListener('click', () => startNewChat());

function appendMessage(role, content, status = 'done') {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = `message-bubble${status === 'error' ? ' error' : ''}`;
  bubble.textContent = content;

  div.appendChild(bubble);
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  return { div, bubble };
}

function setStreaming(active) {
  isStreaming = active;
  sendBtn.disabled = active;
  cancelBtn.hidden = !active;
}

function connectSSE() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/conversations/${conversationId}/stream`);

  let currentBubble = null;
  let currentDiv = null;

  eventSource.addEventListener('message:start', (e) => {
    setStreaming(true);
    const els = appendMessage('assistant', '', 'streaming');
    currentDiv = els.div;
    currentBubble = els.bubble;
    currentBubble.classList.add('streaming');
  });

  eventSource.addEventListener('message:token', (e) => {
    if (!currentBubble) return;
    const data = JSON.parse(e.data);
    currentBubble.textContent += data.token;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  eventSource.addEventListener('message:done', (e) => {
    if (!currentBubble) return;
    const data = JSON.parse(e.data);
    currentBubble.textContent = data.content;
    currentBubble.classList.remove('streaming');

    if (data.sources?.length > 0) {
      const sourcesEl = document.createElement('div');
      sourcesEl.className = 'sources';
      for (const src of data.sources) {
        const pill = document.createElement('a');
        pill.className = 'source-pill';
        pill.href = `/api/reference/${encodeURIComponent(src.filePath)}`;
        pill.target = '_blank';
        pill.rel = 'noopener';
        const name = src.sectionHeading
          ? `${src.fileName} > ${src.sectionHeading}`
          : src.fileName;
        pill.innerHTML = `${escapeHtml(name)} <span class="score">${Math.round(src.score * 100)}%</span>`;
        pill.title = src.highlightedText;
        sourcesEl.appendChild(pill);
      }
      currentDiv.appendChild(sourcesEl);
    }

    setStreaming(false);
    currentBubble = null;
    currentDiv = null;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  eventSource.addEventListener('message:error', (e) => {
    const data = JSON.parse(e.data);
    if (currentBubble) {
      currentBubble.textContent = `Error: ${data.error}`;
      currentBubble.classList.remove('streaming');
      currentBubble.classList.add('error');
    } else {
      appendMessage('assistant', `Error: ${data.error}`, 'error');
    }
    setStreaming(false);
    currentBubble = null;
    currentDiv = null;
  });

  eventSource.addEventListener('message:cancelled', () => {
    if (currentBubble) {
      currentBubble.classList.remove('streaming');
      if (!currentBubble.textContent) {
        currentBubble.textContent = '(cancelled)';
        currentBubble.classList.add('error');
      }
    }
    setStreaming(false);
    currentBubble = null;
    currentDiv = null;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function startNewChat() {
  messagesEl.innerHTML = '';
  setStreaming(false);

  try {
    const res = await fetch('/api/conversations', { method: 'POST' });
    const conv = await res.json();
    conversationId = conv.id;

    // Load messages (includes greeting)
    const detail = await fetch(`/api/conversations/${conversationId}`);
    const data = await detail.json();

    for (const msg of data.messages) {
      appendMessage(msg.role, msg.content, msg.status);
    }

    connectSSE();
    inputEl.focus();
  } catch (err) {
    appendMessage('assistant', 'Failed to start conversation. Is the server running?', 'error');
  }
}

// Start
startNewChat();
