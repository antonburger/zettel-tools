// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from "vscode-languageclient";
import pasteAttachment from "./paste_attachment";
import NoteDefinitionProvider from "./note_definition_provider";

let client: LanguageClient;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const serverOptions: ServerOptions = {
        command:
            "C:\\Users\\Anton\\Code\\zettel-language-server\\zettel-language-server\\bin\\Debug\\netcoreapp3.1\\zettel-language-server.exe",
        transport: TransportKind.stdio,
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: "file", language: "markdown" }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher("**/*.md"),
        },
    };

    client = new LanguageClient(
        "zettelkastenTools",
        "Zettelkasten Tools",
        serverOptions,
        clientOptions
    );

    client.start();

    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            "markdown",
            new NoteDefinitionProvider()
        )
    );
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            "zettelkasten-tools.pasteAttachment",
            async (editor) => {
                try {
                    await pasteAttachment(editor);
                } catch (error) {
                    console.log(error);
                }
            }
        )
    );
}

// this method is called when your extension is deactivated
export function deactivate() {
    if (client) {
        return client.stop();
    }
}
