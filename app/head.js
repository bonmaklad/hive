export default function Head() {
    return (
        <>
            <script async src="https://www.googletagmanager.com/gtag/js?id=G-Y3TBH9LDL0"></script>
            <script
                dangerouslySetInnerHTML={{
                    __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);} 
gtag('js', new Date());

gtag('config', 'G-Y3TBH9LDL0');`
                }}
            />
        </>
    );
}
