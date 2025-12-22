import Link from 'next/link';

export default function NotFound() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Not found</h1>
                    <p className="platform-subtitle">This page doesn’t exist.</p>
                </div>
                <Link className="btn primary" href="/">
                    Go home
                </Link>
            </div>
        </main>
    );
}

