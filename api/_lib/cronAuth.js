// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically
// when the CRON_SECRET env var is set on the project. Manual calls (e.g.
// testing locally) must send the same header.
function isAuthorizedCron(req) {
  const auth = req.headers['authorization'] || '';
  return Boolean(process.env.CRON_SECRET) && auth === `Bearer ${process.env.CRON_SECRET}`;
}

module.exports = { isAuthorizedCron };
