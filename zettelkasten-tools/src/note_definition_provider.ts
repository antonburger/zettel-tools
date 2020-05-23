import * as vscode from 'vscode';
import * as path from 'path';

export default class NoteDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.LocationLink[]> {
        for (const result of matches(/\[[^]*?\]\(([^)]*?)\)/g, document.lineAt(position.line).text)) {
            if (token.isCancellationRequested) {
                return null;
            }
            const matchStart = result.index;
            const matchEnd = matchStart + result[0].length - 1;
            if (matchStart > position.character) {
                break;
            } else if (position.character <= matchEnd) {
                const docPath = document.uri.path;
                const targetPath = path.normalize(path.join(path.dirname(docPath), result[1])).replace(/\\/g, '/');
                const targetUri = document.uri.with({ path: targetPath });
                return new vscode.Location(targetUri, new vscode.Position(0, 0));
            }
        }

        return null;
    }
}

function* matches(re: RegExp, text: string) {
    let result: RegExpExecArray | null;
    result = re.exec(text);
    while (result) {
        yield result;
        result = re.exec(text);
    }
}
