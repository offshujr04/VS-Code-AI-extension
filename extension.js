const vscode = require('vscode');
const https = require('https');

/**
 * @param {vscode.ExtensionContext} context
 */ 
function activate(context) {
  console.log('AI Extension Activated!');
  context.subscriptions.push(
    vscode.commands.registerCommand("aiExtension.openSidebar", async () => {
      // Prompt for Gemini API key (or retrieve from SecretStorage in production)
      const apiKey = await vscode.window.showInputBox({
        prompt: "Enter your Gemini API Key",
        ignoreFocusOut: true,
        password: true
      });
      if (!apiKey) {
        vscode.window.showErrorMessage("Gemini API key is required.");
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        'aiPanel', 
        'Gemini Chat', 
        vscode.ViewColumn.One, // Editor column to show the new webview panel in.
        {
          enableScripts: true, //Allowing js to run in webview
        } // Webview options
      );
      panel.webview.html = getWebviewContent();
      // To listen msg from webview
      panel.webview.onDidReceiveMessage(async message => {
        if (message.type === 'userMessage') {
          const userText = message.text;
          try {
            const reply = await fetchGeminiResponse(userText, apiKey);
            panel.webview.postMessage({ type: 'llmResponse', text: reply });
          } catch (err) {
            // Show error in chat and as a VS Code error message
            panel.webview.postMessage({ type: 'llmResponse', text: "Error: " + err.message });
            vscode.window.showErrorMessage("Gemini API Error: " + err.message);
          }
        }
      });
    })
  );
}

function getWebviewContent() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Gemini Chat</title>
      <style>
        body { font-family: sans-serif; margin: 0; padding: 0; }
        #chat { height: 80vh; overflow-y: auto; padding: 10px; background: #f5f5f5; }
        #chat p { margin: 5px 0; padding: 8px; border-radius: 4px; }
        #chat .user { background:rgb(7, 52, 89); }
        #chat .bot { background: rgb(7, 52, 89); }
        #inputArea { display: flex; padding: 10px; border-top: 1px solid #ccc; }
        #inputBox { flex: 1; padding: 8px; font-size: 1em; }
        #sendBtn { padding: 8px 16px; margin-left: 8px; }
      </style>
    </head>
    <body>
      <div id="chat"></div>
      <div id="inputArea">
        <input id="inputBox" type="text" placeholder="Type a message..." />
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
            vscode.postMessage({ type: 'userMessage', text: msg });
            inputBox.value = '';
          }
        }

        function appendMessage(text, sender) {
          const p = document.createElement('p');
          p.textContent = (sender === 'user' ? "You: " : "Gemini: ") + text;
          p.className = sender;
          chat.appendChild(p);
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

// Gemini API call using Node.js https module
function fetchGeminiResponse(prompt, apiKey) {
  // Format required by Gemini API
  const data = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }]
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    // POST == sending data
    method: 'POST',
    headers: {
      // Format in which content is sent and it size
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      // response is sent in chunks
      res.on('data', chunk => body += chunk);
      // response end
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          // antg is undefiend then no response
          const reply = json.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
          resolve(reply);
        } catch (e) {
          reject(new Error("Invalid response from Gemini API."));
        }
      });
    });
    // htts request error
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
}
