import * as vscode from 'vscode';
import { AISidebarProvider } from './AISidebarProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Extension Activated!');
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      AISidebarProvider.viewType,
      new AISidebarProvider(context)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiExtension.openSidebar', () => {
      vscode.commands.executeCommand('workbench.view.extension.aiSidebar');
    })
  );
}

export function deactivate() {}