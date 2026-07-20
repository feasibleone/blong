export default function isPublic(path: string): boolean {
    return (
        path.startsWith('/documentation/') ||
        path.startsWith('/s/') ||
        path === '/favicon.ico' ||
        path === '/s' ||
        path === '/documentation'
    );
}
