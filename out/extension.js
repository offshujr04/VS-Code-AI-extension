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
class GeminiSidebarProvider {
    //  creating   a context variable that can store the extension context provided by vs code 
    constructor(context) {
        this.context = context;
        console.log('GeminiSidebarProvider initialized');
    }
    async resolveWebviewView(webviewView) {
        console.log('Resolving Gemini Webview View');
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = getWebviewContent();
        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'userMessage') {
                if (!this.apiKey) {
                    // Prompt for API key if not set
                    this.apiKey = await vscode.window.showInputBox({
                        prompt: 'Enter your Gemini API Key',
                        ignoreFocusOut: true,
                        password: true
                    });
                    if (!this.apiKey) {
                        webviewView.webview.postMessage({ type: 'llmResponse', text: 'Error: Gemini API key is required.' });
                        vscode.window.showErrorMessage('Gemini API key is required.');
                        return;
                    }
                }
                try {
                    const reply = await fetchGeminiResponse(message.text, this.apiKey);
                    webviewView.webview.postMessage({ type: 'llmResponse', text: reply });
                }
                catch (err) {
                    webviewView.webview.postMessage({ type: 'llmResponse', text: 'Error: ' + (err?.message || err) });
                    vscode.window.showErrorMessage('Gemini API Error: ' + (err?.message || err));
                }
            }
        });
    }
}
// Register id aiSidebar
GeminiSidebarProvider.viewType = 'aiSidebarView';
function activate(context) {
    console.log('AI Extension Activated!');
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(
    // Calls the string viewtype referring to aisidebar & allows user to see and interact with it
    GeminiSidebarProvider.viewType, new GeminiSidebarProvider(context)));
    // Register the command to reveal the sidebar view
    context.subscriptions.push(vscode.commands.registerCommand('aiExtension.openSidebar', () => {
        vscode.commands.executeCommand('workbench.view.extension.aiSidebar');
    }));
}
function getWebviewContent() {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Gemini Chat</title>
      <style>
        body { 
          font-family: sans-serif; 
          margin: 0; 
          padding: 0; }
        #chat { 
          height: 80vh; 
          overflow-y: auto; 
          padding: 10px; 
          background:hsl(0, 0.00%, 96.10%); 
          border-bottom: 1px solid #ccc;
        }
        #chat p { 
          margin: 5px 0; 
          padding: 8px; 
          border-radius: 4px; 
        }
        #chat .user { background:rgb(7, 52, 89); }
        #chat .bot { background: rgb(7, 52, 89); }
        #inputArea { 
          display: flex; 
          flex-wrap: wrap;
          padding: 10px; 
          border-top: 1px solid #ccc; 
        }
        #inpwrapper { 
          position: relative;
          display: flex; 
          flex: 1; 
          align-items: center; 
        }
        #modelSelectContainer select {
          padding: 8px;
          margin-right: 8px;
          font-size: 14px;
        }
        #inputBox { 
          flex: 1; 
          padding: 8px; 
          font-size: 1em; 
        }
        #sendBtn { padding: 8px 16px; margin-left: 8px; flex-shrink: 0;}

        // Affects the bot's response styling (<pre>)
        div.bot pre,
        pre code {
          background-color: #1e1e1e;
          color: #f8f8f2;
          padding: 16px;
          border-radius: 6px;
          font-family: 'Courier New', monospace;
          white-space: pre-wrap;
          overflow-x: auto;
        }

        div.bot code,
        code {
          background-color: #2d2d2d;
          color: #f8f8f2;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
        }
        div.bot > pre {
          background-color: #1e1e1e;
          color: #f8f8f2;
          padding: 16px;
          border-radius: 6px;
          font-family: 'Courier New', monospace;
          white-space: pre-wrap;
          overflow-x: auto;
          width: fit-content;
          max-width: 90%;
          margin: 20px auto;
        }

      </style>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>       
    </head>
    <body>
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

        sendBtn.addEventListener('click', sendMessage);
        inputBox.addEventListener('keypress', e => {
          if (e.key === 'Enter') sendMessage();
        });

        function sendMessage() {
          const msg = inputBox.value.trim();
          if (msg) {
            appendMessage(msg, 'user');
            // Send message to the backend especially to this function onDidReceiveMessage
            vscode.postMessage({ type: 'userMessage', text: msg });
            inputBox.value = '';
          }
        }

        function appendMessage(text, sender) {
          if (sender === 'bot') {
            const div = document.createElement('div');
            div.className = 'bot';
            // Marked here refers to the marked library
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

        window.addEventListener('message', event => {
          const message = event.data;
          if (message.type === 'llmResponse') {
            appendMessage(message.text, 'bot');
          }
        });
      </script>
    </body>
    </html>
  `;
}
// Gemini API call using global fetch API
async function fetchGeminiResponse(prompt, apiKey) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
        })
    });
    if (!response.ok) {
        throw new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
}
function deactivate() { }
