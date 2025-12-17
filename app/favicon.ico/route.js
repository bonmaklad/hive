import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-static';

export async function GET() {
    const filePath = path.join(process.cwd(), 'public', 'logo-square.png');
    const file = await readFile(filePath);

    return new Response(file, {
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=31536000, immutable'
        }
    });
}

