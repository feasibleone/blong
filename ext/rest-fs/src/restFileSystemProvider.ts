import * as vscode from 'vscode';

/**
 * Configuration for the REST API endpoint
 */
type RestFsConfig = Record<string, {
    baseUrl: string;
    headers?: Record<string, string>;
}>;


/**
 * Response type for stat endpoint
 */
interface StatResponse {
    type: 'file' | 'directory' | 'unknown';
    symLink?: boolean;
    ctime?: number;
    mtime?: number;
    size?: number;
}

/**
 * Response type for readdir endpoint
 */
interface DirectoryEntry {
    name: string;
    type: 'file' | 'directory';
}

/**
 * REST Filesystem Provider
 * Implements VS Code's FileSystemProvider interface backed by a REST API
 */
export class RestFileSystemProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    private config: RestFsConfig;

    constructor(config: RestFsConfig) {
        this.config = config;
    }

    /**
     * Watch for changes - simplified implementation
     */
    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        // In a real implementation, you might set up polling or websocket connection
        return new vscode.Disposable(() => {});
    }

    /**
     * Get file/directory metadata
     */
    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const response = await this.fetch(`${this.config[uri.authority].baseUrl}/stat${uri.path}`, {
            method: 'GET',
        }, uri.authority);

        if (!response.ok) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const data = await response.json() as StatResponse;
        return {
            type: {
                file: vscode.FileType.File,
                directory: vscode.FileType.Directory,
                unknown: vscode.FileType.Unknown,
            }[data.type] || (data.symLink ? vscode.FileType.SymbolicLink : 0),
            ctime: data.ctime || Date.now(),
            mtime: data.mtime || Date.now(),
            size: data.size || 0,
        };
    }

    /**
     * Read directory contents
     */
    async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const response = await this.fetch(`${this.config[uri.authority].baseUrl}/readdir${uri.path}`, {
            method: 'GET',
        }, uri.authority);

        if (!response.ok) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const entries = await response.json() as DirectoryEntry[];
        return entries.map((entry) => [
            entry.name,
            entry.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File,
        ]);
    }

    /**
     * Create a directory
     */
    async createDirectory(uri: vscode.Uri): Promise<void> {
        const response = await this.fetch(`${this.config[uri.authority].baseUrl}/mkdir${uri.path}`, {
            method: 'POST',
        }, uri.authority);

        if (!response.ok) {
            throw vscode.FileSystemError.Unavailable(uri);
        }

        this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
    }

    /**
     * Read file contents
     */
    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const response = await this.fetch(`${this.config[uri.authority].baseUrl}/read${uri.path}`, {
            method: 'GET',
        }, uri.authority);

        if (!response.ok) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const arrayBuffer = await response.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    }

    /**
     * Write file contents
     */
    async writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean }
    ): Promise<void> {
        // Check if file exists
        const exists = await this.exists(uri);

        if (exists && !options.overwrite) {
            throw vscode.FileSystemError.FileExists(uri);
        }

        if (!exists && !options.create) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        const response = await this.fetch(`${this.config[uri.authority].baseUrl}/write${uri.path}`, {
            method: 'POST',
            body: content,
            headers: {
                'Content-Type': 'application/octet-stream',
            },
        }, uri.authority);

        if (!response.ok) {
            throw vscode.FileSystemError.Unavailable(uri);
        }

        this._emitter.fire([{
            type: exists ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created,
            uri,
        }]);
    }

    /**
     * Delete a file or directory
     */
    async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
        const response = await this.fetch(
            `${this.config[uri.authority].baseUrl}/delete${uri.path}?recursive=${options.recursive}`,
            {
                method: 'DELETE',
            },
            uri.authority
        );

        if (!response.ok) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }

        this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
    }

    /**
     * Rename/move a file or directory
     */
    async rename(
        oldUri: vscode.Uri,
        newUri: vscode.Uri,
        options: { overwrite: boolean }
    ): Promise<void> {
        const response = await this.fetch(`${this.config[oldUri.authority].baseUrl}/rename`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                oldPath: oldUri.path,
                newPath: newUri.path,
                overwrite: options.overwrite,
            }),
        }, oldUri.authority);

        if (!response.ok) {
            throw vscode.FileSystemError.Unavailable(oldUri);
        }

        this._emitter.fire([
            { type: vscode.FileChangeType.Deleted, uri: oldUri },
            { type: vscode.FileChangeType.Created, uri: newUri },
        ]);
    }

    /**
     * Copy a file or directory (optional method)
     */
    async copy(
        source: vscode.Uri,
        destination: vscode.Uri,
        options: { overwrite: boolean }
    ): Promise<void> {
        const response = await this.fetch(`${this.config[source.authority].baseUrl}/copy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source: source.path,
                destination: destination.path,
                overwrite: options.overwrite,
            }),
        }, source.authority);

        if (!response.ok) {
            throw vscode.FileSystemError.Unavailable(source);
        }

        this._emitter.fire([{ type: vscode.FileChangeType.Created, uri: destination }]);
    }

    /**
     * Helper method to check if file/directory exists
     */
    private async exists(uri: vscode.Uri): Promise<boolean> {
        try {
            await this.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Helper method to make REST API calls with authentication
     */
    private async fetch(url: string, options: RequestInit = {}, authority: string): Promise<Response> {
        const headers = {
            ...this.config?.[authority]?.headers,
            ...options.headers,
        };

        return fetch(url, {
            ...options,
            headers,
        });
    }
}
