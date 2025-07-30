import * as vscode from 'vscode';
import * as path from 'path';
import { callGemini, callGroq } from './llm';
import { getWebviewContent } from './webviewContent';

export class AISidebarProvider implements vscode.WebviewViewProvider {
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
            } else {
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
        this.attachedFiles = this.attachedFiles.filter(f => f.name !== fileName);
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
          attachedFilesContext = this.attachedFiles.map(f =>
            `\n\n---\nAttached file: ${path.basename(f.name)}\n${f.content}\n---\n`
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

    vscode.window.onDidChangeActiveTextEditor(() => {
      updateWebviewFiles();
    });
  }
}
