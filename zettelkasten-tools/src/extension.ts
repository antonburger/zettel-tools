// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerTextEditorCommand('zettelkasten-tools.pasteAttachment', async editor => {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (!workspaceFolder) {
            await vscode.window.showErrorMessage("Target document must belong to an open workspace folder.");
            return;
        }

        const mimeExtensions = new Map<string, string>([
            [ "image/svg", ".svg" ],
            [ "image/png", ".png" ],
            [ "image/jpg", ".jpg" ],
            [ "image/jpeg", ".jpg" ],
            [ "image/bmp", ".bmp" ],
            [ "text/html", ".html" ],
            [ "text/plain", ".txt" ],
        ]);

        const deletionRange = editor.selection;
        const insertionPoint = editor.selection.active;
        const copyQOutput = await runCopyQ("copyq", getCopyQScript([...mimeExtensions.keys()]));

        const [ sourceFilename, sourceMimeType ] = copyQOutput.split(/[\r\n]+/, 2);
        const sourceUri = vscode.Uri.file(sourceFilename);

        const attachmentDirectory = workspaceFolder.uri.with({ path: workspaceFolder.uri.path + "/attachments" });
        await vscode.workspace.fs.createDirectory(attachmentDirectory);

        const targetBaseName = createBaseName();
        const targetExtension = sourceMimeType ? mimeExtensions.get(sourceMimeType)! : path.extname(sourceFilename);
        const targetUri = attachmentDirectory.with({ path: `${attachmentDirectory.path}/${targetBaseName}${targetExtension}` });
        await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: true });

        const relativeTargetPath = path.relative(path.dirname(editor.document.uri.fsPath), targetUri.fsPath).replace(/\\/g, "/");
        const imagePrefix = isImage(targetExtension) ? "!" : "";
        const replacement = `${imagePrefix}[${targetBaseName}](${relativeTargetPath})`;

        editor.edit(builder => {
            builder.delete(deletionRange);
            builder.insert(insertionPoint, replacement);
        }, {
            undoStopBefore: true,
            undoStopAfter: true
        });
    });

    context.subscriptions.push(disposable);

    function createBaseName() {
        const date = new Date();
        return `${date.getFullYear()}-${pad2Digits(date.getMonth() + 1)}-${pad2Digits(date.getDate())}_${pad2Digits(date.getHours())}-${pad2Digits(date.getMinutes())}-${pad2Digits(date.getSeconds())}`;

        function pad2Digits(n: number) {
            return 0 <= n && n < 10 ? "0" + n : n;
        }
    }

    function isImage(extension: string) {
        switch (extension) {
        case ".svg":
        case ".png":
        case ".jpg":
        case ".bmp":
            return true;
        default:
            return false;
        }
    }

    function getCopyQScript(supportedMimeTypes: string[]) {
        const mimeBlock = supportedMimeTypes.map(mime => `'${mime}',`).join("\n");
        return `
copyq:
var types = [
${mimeBlock}
]

var matchingType
var content

for (var i = 0; i < types.length; i++) {
    var type = types[i];
    if (hasClipboardFormat(type)) {
        matchingType = type
        content = clipboard(type)
        break
    }
}

if (!matchingType) fail()

if (matchingType == 'text/plain' && str(content).indexOf('file:///') == 0) {
    print(str(content).substring(8))
} else {
    var file = new TemporaryFile()
    file.open()
    file.setAutoRemove(false)
    file.write(content)
    file.close()
    print(file.fileName() + '\\\\n')
    print(matchingType)
}
`;
    }
}

// this method is called when your extension is deactivated
export function deactivate() {}

function runCopyQ(copyqCommand: string, script:string): PromiseLike<string> {
    return new Promise((resolve, reject) => {
        const ps = child_process.spawn(copyqCommand, ["eval", script], {
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        const stdout = [] as string[];
        const stderr = [] as string[];

        ps.stdout.on("data", chunk => stdout.push(chunk));
        ps.stderr.on("data", chunk => stderr.push(chunk));
        ps.on("error", reject);
        ps.on("exit", code => {
            if (code === 0) {
                resolve(stdout.join("\n"));
            } else {
                reject(new Error(`copyq invocation returned ${code}: ${stderr.join("\n")}`));
            }
        });
    });
}
