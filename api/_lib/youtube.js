// Pull the 11-character video ID out of the YouTube links people paste:
// youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID and /live/ID.
// Returns null for anything else. admin.js has a copy to validate on save.
function youtubeVideoId(url) {
  const m = String(url || '').trim().match(
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})(?:[?&#/].*)?$/
  );
  return m ? m[1] : null;
}

module.exports = { youtubeVideoId };
