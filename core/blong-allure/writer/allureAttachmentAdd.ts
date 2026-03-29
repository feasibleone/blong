/**
 * Write Allure attachment files
 */

import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {IAllureAttachmentDescriptor} from '../types.js';

/**
 * Write an attachment file and return its descriptor
 * 
 * @param outputDir - Results output directory
 * @param name - Human-readable attachment name
 * @param content - Attachment content (string or Buffer)
 * @param type - MIME type (e.g., 'application/json', 'text/plain', 'text/html')
 * @returns Attachment descriptor for embedding in result
 */
export async function allureAttachmentAdd(
    outputDir: string,
    name: string,
    content: string | Buffer,
    type: string,
): Promise<IAllureAttachmentDescriptor> {
    const uuid = randomUUID();
    
    // Determine file extension from MIME type
    const ext = getExtensionFromType(type);
    const filename = `${uuid}-attachment${ext}`;
    const filepath = join(outputDir, filename);

    // Write attachment file
    await writeFile(filepath, content, 'utf-8');

    return {
        uuid,
        name,
        type,
        source: filename,
    };
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromType(type: string): string {
    const typeMap: Record<string, string> = {
        'application/json': '.json',
        'text/plain': '.txt',
        'text/html': '.html',
        'text/csv': '.csv',
        'application/xml': '.xml',
        'image/png': '.png',
        'image/jpeg': '.jpg',
    };

    return typeMap[type] || '.txt';
}
