"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
class AISidebarProvider {
    constructor(context) {
        this.context = context;
        this.apiKeys = {};
        this.attachedFiles = [];
        console.log('AISidebarProvider initialized');
    }
    async resolveWebviewView(webviewView) {
        const updateWebviewFiles = () => {
            const activeEditor = vscode.window.activeTextEditor;
            const currentFileName = activeEditor ? path.basename(activeEditor.document.fileName) : '';
            webviewView.webview.postMessage({
                type: 'updateFiles',
                currentFile: currentFileName,
                attachedFiles: this.attachedFiles.map(f => path.basename(f.name))
            });
        };
        // Initial load
        const activeEditor = vscode.window.activeTextEditor;
        const currentFileName = activeEditor ? path.basename(activeEditor.document.fileName) : '';
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getWebviewContent(currentFileName, this.attachedFiles.map(f => path.basename(f.name)));
        webviewView.webview.onDidReceiveMessage(async (message) => {
            // Attach files handling
            if (message.type === 'addFiles') {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders || workspaceFolders.length === 0) {
                    vscode.window.showErrorMessage('No workspace folder is open.');
                    return;
                }
                const rootUri = workspaceFolders[0].uri;
                const files = await vscode.window.showOpenDialog({
                    canSelectMany: true,
                    defaultUri: rootUri,
                    openLabel: 'Attach',
                    title: 'Select a file to attach',
                });
                if (files) {
                    for (const file of files) {
                        if (file.fsPath.startsWith(rootUri.fsPath)) {
                            const doc = await vscode.workspace.openTextDocument(file);
                            this.attachedFiles.push({ name: file.fsPath, content: doc.getText() });
                        }
                        else {
                            vscode.window.showErrorMessage(`File ${file.fsPath} is outside the workspace folder.`);
                            continue;
                        }
                    }
                    updateWebviewFiles();
                }
            }
            // Remove attached file
            if (message.type === 'removeAttachedFile') {
                const fileName = message.fileName;
                this.attachedFiles = this.attachedFiles.filter(f => path.basename(f.name) !== fileName);
                updateWebviewFiles();
            }
            // User message handling
            if (message.type === 'userMessage') {
                const prompt = message.text;
                const model = message.model;
                let responseText = '';
                // Always get the current file
                let filecontext = '';
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor) {
                    const currentfile = activeEditor.document;
                    filecontext = `\n\n---\nCurrent file: ${path.basename(currentfile.fileName)}\n${currentfile.getText()}\n---\n`;
                }
                // Add attached files context
                let attachedFilesContext = '';
                if (this.attachedFiles.length > 0) {
                    attachedFilesContext = this.attachedFiles.map(f => `\n\n---\nAttached file: ${path.basename(f.name)}\n${f.content}\n---\n`).join('');
                }
                // Combine prompt and all context
                const fullPrompt = prompt + filecontext + attachedFilesContext;
                // Prompt for API key if not set for this model
                if (!this.apiKeys[model]) {
                    this.apiKeys[model] = await vscode.window.showInputBox({
                        prompt: `Enter your ${model} API Key`,
                        ignoreFocusOut: true,
                        password: true
                    });
                    if (!this.apiKeys[model]) {
                        webviewView.webview.postMessage({ type: 'llmResponse', text: `Error: ${model} API key is required.` });
                        vscode.window.showErrorMessage(`${model} API key is required.`);
                        return;
                    }
                }
                try {
                    if (model === 'grok') {
                        responseText = await callGroq(fullPrompt, this.apiKeys[model]);
                    }
                    else if (model === 'gemini') {
                        responseText = await callGemini(fullPrompt, this.apiKeys[model]);
                    }
                    else {
                        responseText = 'Model not supported.';
                    }
                }
                catch (err) {
                    responseText = 'Error: ' + (err?.message || err);
                }
                webviewView.webview.postMessage({ type: 'llmResponse', text: responseText });
            }
        });
        // Update files if the active editor changes
        vscode.window.onDidChangeActiveTextEditor(() => {
            updateWebviewFiles();
        });
    }
}
AISidebarProvider.viewType = 'aiSidebarView';
async function callGemini(prompt, apiKey) {
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await response.json();
        console.log('Gemini API response:', data);
        if (data.error) {
            return `Gemini API Error: ${data.error.message || JSON.stringify(data.error)}`;
        }
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response. This is an error.';
    }
    catch (err) {
        console.error('Gemini fetch error:', err);
        return `Gemini fetch error: ${err?.message || err}`;
    }
}
async function callGroq(prompt, apiKey) {
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "deepseek-r1-distill-llama-70b",
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 1024,
            }),
        });
        const data = await response.json();
        console.log('Groq API response:', data);
        if (data.error) {
            return `Groq API Error: ${data.error.message || JSON.stringify(data.error)}`;
        }
        if (data?.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        else {
            return 'No response. This is an error.';
        }
    }
    catch (err) {
        console.error('Groq fetch error:', err);
        return `Groq fetch error: ${err?.message || err}`;
    }
}
function activate(context) {
    console.log('AI Extension Activated!');
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(
    // Calls the string viewtype referring to aisidebar & allows user to see and interact with it
    AISidebarProvider.viewType, new AISidebarProvider(context)));
    // Register the command to reveal the sidebar view
    context.subscriptions.push(vscode.commands.registerCommand('aiExtension.openSidebar', () => {
        vscode.commands.executeCommand('workbench.view.extension.aiSidebar');
    }));
}
function getWebviewContent(currentFileName = '', attachedFiles = []) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Gemini Chat</title>
      <style>
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
      </style>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>       
    </head>
    <body>
      <div id="contextbar">
        <span><b>Current File:</b> <span id="currentFile">${currentFileName || 'None'}</span></span>
        <span><b>Attached Files:</b>
          <ul id="attachedFiles">
            ${attachedFiles.map(file => `<li>${file}<span class="remove-file" data-file="${file}">&times;</span></li>`).join('')}
          </ul>
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
      <script>
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
            document.getElementById('currentFile').textContent = message.currentFile || 'None';
            document.getElementById('attachedFiles').innerHTML =
              (message.attachedFiles || []).map(f => \`<li>\${f}<span class="remove-file" data-file="\${f}">&times;</span></li>\`).join('');
          }
        });
      </script>
    </body>
    </html>
  `;
}
function deactivate() { }
