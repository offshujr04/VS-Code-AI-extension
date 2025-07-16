import { join } from 'path/win32';
import * as vscode from 'vscode';

class AISidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'aiSidebarView';
  private apiKeys: { [model: string]: string | undefined } = {};
  private attachedFiles: { name: string, content: string }[] = [];

  constructor(private context: vscode.ExtensionContext) {
    console.log('AISidebarProvider initialized');
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    const updateWebviewFiles = () => {
      const activeEditor = vscode.window.activeTextEditor;
      const currentFileName = activeEditor ? activeEditor.document.fileName : '';
      webviewView.webview.postMessage({
        type: 'updateFiles',
        currentFile: currentFileName,
        attachedFiles: this.attachedFiles.map(f => f.name)
      });
    };

    // Initial load
    const activeEditor = vscode.window.activeTextEditor;
    const currentFileName = activeEditor ? activeEditor.document.fileName : '';
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getWebviewContent(currentFileName, this.attachedFiles.map(f => f.name));

    webviewView.webview.onDidReceiveMessage(async message => {
      // Attach files handling
      if (message.type === 'addFiles') {
        const files = await vscode.window.showOpenDialog({ canSelectMany: true });
        if (files) {
          for (const file of files) {
            const doc = await vscode.workspace.openTextDocument(file);
            this.attachedFiles.push({ name: file.fsPath, content: doc.getText() });
          }
          updateWebviewFiles();
        }
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
          filecontext = `\n\n---\nCurrent file: ${currentfile.fileName}\n${currentfile.getText()}\n---\n`;
        }

        // Add attached files context
        let attachedFilesContext = '';
        if (this.attachedFiles.length > 0) {
          attachedFilesContext = this.attachedFiles.map(f =>
            `\n\n---\nAttached file: ${f.name}\n${f.content}\n---\n`
          ).join('');
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
            responseText = await callGroq(fullPrompt, this.apiKeys[model]!);
          } else if (model === 'gemini') {
            responseText = await callGemini(fullPrompt, this.apiKeys[model]!);
          } else {
            responseText = 'Model not supported.';
          }
        } catch (err: any) {
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

async function callGemini(prompt: string, apiKey: string): Promise<string> {
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
  } catch (err: any) {
    console.error('Gemini fetch error:', err);
    return `Gemini fetch error: ${err?.message || err}`;
  }
}

async function callGroq(prompt: string, apiKey: string): Promise<string> {
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
    } else {
      return 'No response. This is an error.';
    }
  } catch (err: any) {
    console.error('Groq fetch error:', err);
    return `Groq fetch error: ${err?.message || err}`;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Extension Activated!');
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
    // Calls the string viewtype referring to aisidebar & allows user to see and interact with it
      AISidebarProvider.viewType,
      new AISidebarProvider(context)
    )
  );

  // Register the command to reveal the sidebar view
  context.subscriptions.push(
    vscode.commands.registerCommand('aiExtension.openSidebar', () => {
      vscode.commands.executeCommand('workbench.view.extension.aiSidebar');
    })
  );
}

function getWebviewContent(currentFileName = '', attachedFiles: string[] = []): string {
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
        #attachedFiles li { list-style: none; display: inline; margin-right: 10px; padding: 2px 6px; font-size: 0.95em; color: #333; }
        #attachedFiles li:hover { background: #d1d5db; cursor: pointer; }
        #addfiles_btn{ margin-left: auto; padding: 6px 14px; font-size: 0.95em; cursor: pointer; }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>       
    </head>
    <body>
      <div id="contextbar">
        <span><b>Current File:</b> <span id="currentFile">${currentFileName || 'None'}</span></span>
        <span><b>Attached Files:</b>
          <ul id="attachedFiles">
            ${attachedFiles.map(file => `<li>${file}</li>`).join('')}
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

        window.addEventListener('message', event => {
          const message = event.data;
          if (message.type === 'llmResponse') {
            appendMessage(message.text, 'bot');
          }
          if (message.type === 'updateFiles') {
            document.getElementById('currentFile').textContent = message.currentFile || 'None';
            document.getElementById('attachedFiles').innerHTML =
              (message.attachedFiles || []).map(f => \`<li>\${f}</li>\`).join('');
          }
        });
      </script>
    </body>
    </html>
  `;
}

export function deactivate() {}