function getDisplayName(filePath: string): string {
  // Returns file name without extension
  const fileName = filePath.split(/[\\/]/).pop() || '';
  return fileName.split('.').slice(0, -1).join('.') || fileName;
}

const webviewStyles = `
  body { font-family: sans-serif; margin: 0; padding: 0; }
  #chat { height: 80vh; overflow-y: auto; padding: 10px; background:hsl(0, 0.00%, 96.10%); border-bottom: 1px solid #ccc; }
  #chat p { margin: 5px 0; padding: 8px; border-radius: 4px; }
  #chat .user { background:rgb(7, 52, 89); color: #fff; }
  #chat .bot { background: rgb(7, 52, 89); color: #fff; }
  #inputArea { display: flex; flex-wrap: wrap; padding: 10px; border-top: 1px solid #ccc; }
  #inpwrapper { position: relative; display: flex; flex: 1; align-items: center; }
  #modelSelectContainer select { padding: 8px; margin-right: 8px; font-size: 14px; }
  #inputBox { flex: 1; padding: 8px; font-size: 1em; }
  #sendBtn { padding: 8px 16px; margin-left: 8px; flex-shrink: 0;}
  #contextbar{ display:flex; background:  #101010ff; padding: 10px 16px; border-bottom: 1px solid #ccc; align-items: center; gap: 16px; }
  #attachedFiles{ margin: 0 0 0 10px; padding: 0; display: inline; }
  #attachedFiles li { list-style: none; display: inline; margin-right: 10px; padding: 2px 6px; font-size: 0.95em; color: #e5e7eb; background: #23272e; border-radius: 4px; }
  #attachedFiles li:hover { background: #484a4c; cursor: pointer; }
  #attachedFiles li .remove-file {
    color: #ff6b6b;
    margin-left: 6px;
    cursor: pointer;
    font-weight: bold;
    font-size: 1.1em;
  }
  #attachedFiles li .remove-file:hover {
    color: #ff2222;
  }
  #addfiles_btn{ margin-left: auto; padding: 6px 14px; font-size: 0.95em; cursor: pointer; }
`;

const webviewScript = `
  const vscode = acquireVsCodeApi();
  const chat = document.getElementById('chat');
  const inputBox = document.getElementById('inputBox');
  const sendBtn = document.getElementById('sendBtn');
  const modelSelect = document.getElementById('modelSelect');

  sendBtn.addEventListener('click', sendMessage);
  inputBox.addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });

  function sendMessage() {
    const msg = inputBox.value.trim();
    const selectedModel = modelSelect.value;
    if(msg){
      appendMessage(msg, 'user');
      vscode.postMessage({
        type: 'userMessage',
        text: msg,
        model: selectedModel
      });
      inputBox.value = '';
    }
  }

  function appendMessage(text, sender) {
    if (sender === 'bot') {
      const div = document.createElement('div');
      div.className = 'bot';
      div.innerHTML = marked.parse(text);
      chat.appendChild(div);
    } else {
      const p = document.createElement('p');
      p.textContent = 'You: ' + text;
      p.className = 'user';
      chat.appendChild(p);
    }
    chat.scrollTop = chat.scrollHeight;
  }
  
  document.getElementById('addfiles_btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'addFiles' });
  });

  document.getElementById('attachedFiles').addEventListener('click', function(e) {
    if (e.target.classList.contains('remove-file')) {
      const fileName = e.target.getAttribute('data-file');
      vscode.postMessage({ type: 'removeAttachedFile', fileName });
    }
  });

  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'llmResponse') {
      appendMessage(message.text, 'bot');
    }
    if (message.type === 'updateFiles') {
      document.getElementById('currentFile').textContent = message.currentFile
        ? getDisplayName(message.currentFile)
        : 'None';
      document.getElementById('attachedFiles').innerHTML =
        (message.attachedFiles || []).map(f =>
          \`<li>\${getDisplayName(f)}<span class="remove-file" data-file="\${f}">&times;</span></li>\`
        ).join('');
    }
  });

  // Helper for display name in JS
  function getDisplayName(filePath) {
    const fileName = filePath.split(/[\\\\/]/).pop() || '';
    return fileName.split('.').slice(0, -1).join('.') || fileName;
  }
`;

export function getWebviewContent(currentFileName = '', attachedFiles: string[] = []): string {
  const currentDisplay = getDisplayName(currentFileName);
  const attachedList = (attachedFiles || [])
    .map(file => `<li>${getDisplayName(file)}<span class="remove-file" data-file="${file}">&times;</span></li>`)
    .join('');
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Gemini Chat</title>
      <style>${webviewStyles}</style>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>       
    </head>
    <body>
      <div id="contextbar">
        <span><b>Current File:</b> <span id="currentFile">${currentDisplay || 'None'}</span></span>
        <span><b>Attached Files:</b>
          <ul id="attachedFiles">${attachedList}</ul>
        </span>
        <button id="addfiles_btn">Attach Files</button>
      </div>
      <div id="chat"></div>
      <div id="inputArea">
        <div id="inpwrapper">
          <div id="modelSelectContainer">
            <select id="modelSelect">
              <option value="gemini">Gemini</option>
              <option value="grok">Grok</option>
            </select>
          </div>
          <input id="inputBox" type="text" placeholder="Enter your query" />
        </div>  
        <button id="sendBtn">Send</button>
      </div>
      <script>${webviewScript}</script>
    </body>
    </html>
  `;
}
