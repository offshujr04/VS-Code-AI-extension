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
exports.AISidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const llm_1 = require("./llm");
const webviewContent_1 = require("./webviewContent");
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
        webviewView.webview.html = (0, webviewContent_1.getWebviewContent)(currentFileName, this.attachedFiles.map(f => f.name));
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
                        responseText = await (0, llm_1.callGroq)(fullPrompt, this.apiKeys[model]);
                    }
                    else if (model === 'gemini') {
                        responseText = await (0, llm_1.callGemini)(fullPrompt, this.apiKeys[model]);
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
        vscode.window.onDidChangeActiveTextEditor(() => {
            updateWebviewFiles();
        });
    }
}
exports.AISidebarProvider = AISidebarProvider;
AISidebarProvider.viewType = 'aiSidebarView';
