import GalleryPanel from '../components/GalleryPanel';

export const dynamic = 'force-dynamic';

export default function GalleryPage() {
    return (
        <main className="platform-main">
            <div className="platform-title-row">
                <div>
                    <h1>Gallery</h1>
                    <p className="platform-subtitle">Upload and explore member photos and videos.</p>
                </div>
            </div>
            <GalleryPanel />
        </main>
    );
}
