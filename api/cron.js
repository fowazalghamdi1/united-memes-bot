// /api/cron.js
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Your meme and tweet logic goes here
  console.log("Running meme bot logic...");

  // Example only (replace this with actual logic)
  res.status(200).json({ message: 'Cron triggered successfully' });
}
