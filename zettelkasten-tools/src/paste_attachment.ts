import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';

// Supported MIME types and the extensions they'll be saved with
const mimeExtensions = new Map<string, string>([
    ["image/svg", ".svg"],
    ["image/png", ".png"],
    ["image/jpg", ".jpg"],
    ["image/jpeg", ".jpg"],
    ["image/bmp", ".bmp"],
    ["text/html", ".html"],
    ["text/plain", ".txt"],
]);

// Main text editor command function
export default async function pasteAttachment(editor: vscode.TextEditor) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (!workspaceFolder) {
        await vscode.window.showErrorMessage("Target document must belong to an open workspace folder.");
        return;
    }

    // Save the range which the attachment link should overwrite
    const deletionRange = editor.selection;
    const insertionPoint = editor.selection.active;

    // Produce the attachment file
    const mimeTypes = [...mimeExtensions.keys()];
    const copyQOutput = await runCopyQ("copyq", getCopyQScript(mimeTypes)).then(undefined, elaborateError("There was an error running copyq"));

    const lines = copyQOutput.split(/[\r\n]+/);
    if (lines.length < 1) {
        return;
    }

    // Handle only the first file
    // There may be sensible ways to handle more than one copied file, but it
    // doesn't seem likely to be a common operation
    const [sourceMimeType, sourceFilename] = parseCopyQLine(lines[0], mimeTypes);
    const sourceUri = vscode.Uri.file(sourceFilename);

    // Create a directory to hold the attachments
    const attachmentDirectory = workspaceFolder.uri.with({ path: workspaceFolder.uri.path + "/attachments" });
    await vscode.workspace.fs.createDirectory(attachmentDirectory).then(undefined, elaborateError("Couldn't create attachment directory"));

    // Construct a name for the attachment file and copy it into the workspace
    const targetBaseName = createBaseName();
    const targetExtension = sourceMimeType ? mimeExtensions.get(sourceMimeType)! : path.extname(sourceFilename);
    const targetUri = attachmentDirectory.with({ path: `${attachmentDirectory.path}/${targetBaseName}${targetExtension}` });
    await vscode.workspace.fs.copy(sourceUri, targetUri, { overwrite: true }).then(undefined, elaborateError("Couldn't copy attachment"));

    // Build and insert a link to the attachment for the current editor
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
}

// Run a copyq script to print to stdout the name of a file to insert as an attachment
// If the clipboard content is a file copied in the shell, this is just a filename
// If the clipboard content is an image or text, the script will create a temporary
// file and print a line in the following format:
// <mime_type>:<temp filename>
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
    var type = types[i]
    // Don't use hasClipboardFormat(type) - clipboard(type) performs
    // format conversion which makes it more permissive and means
    // it's a better way to check for the formats we're interested in
    content = clipboard(type)
    if (content && content.length > 0) {
        matchingType = type
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
    print(matchingType + ':' + file.fileName())
}
`;
}

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

// Each line output by copyq can take one of two forms:
// <filename> - just a filename with no MIME type, when one or more files is copied in the shell
// <mime_type>:<temp filename> - a MIME type and the name of a temp file, separated by :
function parseCopyQLine(copyQLine: string, supportedMimeTypes: string[]): [string | undefined, string] {
    const parts = copyQLine.split(":");
    return parts[0] && supportedMimeTypes.indexOf(parts[0]) >= 0
        ? [parts[0], parts.slice(1).join(":")]
        : [undefined, copyQLine];
}

// Generate a base name for an attachment file
function createBaseName() {
    const date = new Date();
    return `${date.getFullYear()}-${pad2Digits(date.getMonth() + 1)}-${pad2Digits(date.getDate())}_${pad2Digits(date.getHours())}-${pad2Digits(date.getMinutes())}-${pad2Digits(date.getSeconds())}`;

    function pad2Digits(n: number) {
        return 0 <= n && n < 10 ? "0" + n : n;
    }
}

// Determine from a file's extension whether it should be treated as an image
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

// Show a VSCode error window with a human-friendly message, while throwing the original error
function elaborateError(explanation: string): (reason: any) => Promise<never> {
    return async reason => {
        await vscode.window.showErrorMessage(explanation);
        throw reason;
    };
}
