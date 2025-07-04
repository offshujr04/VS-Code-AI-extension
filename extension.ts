import * as vscode from 'vscode';
class GeminiSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'aiSidebarView';
  private apiKey: string | undefined;
  constructor(private context: vscode.ExtensionContext) {
    console.log('GeminiSidebarProvider initialized');
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    console.log('Resolving Gemini Webview View');
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = getWebviewContent();

    webviewView.webview.onDidReceiveMessage(async message => {
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
        } catch (err: any) {
          webviewView.webview.postMessage({ type: 'llmResponse', text: 'Error: ' + (err?.message || err) });
          vscode.window.showErrorMessage('Gemini API Error: ' + (err?.message || err));
        }
      }
    });
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Extension Activated!');
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GeminiSidebarProvider.viewType,
      new GeminiSidebarProvider(context)
    )
  );

  // Register the command to reveal the sidebar view
  context.subscriptions.push(
    vscode.commands.registerCommand('aiExtension.openSidebar', () => {
      vscode.commands.executeCommand('workbench.view.extension.aiSidebar');
    })
  );
}


function getWebviewContent(): string {
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
          padding: 10px; 
          border-top: 1px solid #ccc; 
        }
        #inputBox { flex: 1; padding: 8px; font-size: 1em; }
        #sendBtn { padding: 8px 16px; margin-left: 8px; }
      </style>
    </head>
    <body>
      <div id="chat"></div>
      <div id="inputArea">
        <input id="inputBox" type="text" placeholder="Enter your query" />
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
          const p = document.createElement('p');
          p.textContent = (sender === 'user' ? 'You: ' : 'Gemini: ') + text;
          p.className = sender;
          chat.appendChild(p);
          // To go to the bottom of the chat
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
async function fetchGeminiResponse(prompt: string, apiKey: string): Promise<string> {
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

export function deactivate() {}