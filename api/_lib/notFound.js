// The 404 page, shared by the catch-all route and by an activity slug that
// doesn't resolve.
//
// Two things matter here beyond looking right: it returns a real 404 status
// so search engines drop the URL rather than indexing an error, and it carries
// noindex so the page itself never gets indexed. It also offers a way onward —
// a dead end on a booking site is a lost guest.

function renderNotFound({
  heading = "We can't find that page",
  message = 'It may have been renamed, or the link may be incomplete.',
} = {}) {
  return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page not found | Banana Villas Watamu</title>
    <meta name="robots" content="noindex, follow">
    <link rel="icon" href="/images/favicon.ico" sizes="any">
    <link rel="icon" href="/images/favicon-32.png" type="image/png" sizes="32x32">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Lora:wght@400;600&display=swap"
        rel="stylesheet">
    <link rel="stylesheet" href="/styles.css">
</head>

<body class="notfound-body">
    <main class="notfound">
        <div class="container notfound-inner">
            <a href="/" class="notfound-logo">
                <img src="/images/banana-villas-watamu-logo.png" alt="Banana Villas Watamu">
            </a>
            <p class="notfound-code">404</p>
            <h1>${heading}</h1>
            <p class="notfound-message">${message}</p>

            <div class="notfound-actions">
                <a href="/" class="btn-primary btn-cta">Back to the villa <span aria-hidden="true">&rarr;</span></a>
            </div>

            <nav class="notfound-links" aria-label="Popular pages">
                <a href="/#gallery">Gallery</a>
                <a href="/activities">Things to do</a>
                <a href="/#amenities">Amenities</a>
                <a href="/#faq">FAQ</a>
                <a href="/#contact">Book your stay</a>
            </nav>

            <p class="notfound-help">Still stuck? Message us on
                <a href="https://wa.me/254715257111" target="_blank" rel="noopener noreferrer">WhatsApp</a>
                and we'll point you the right way.</p>
        </div>
    </main>
</body>

</html>
`;
}

module.exports = { renderNotFound };
