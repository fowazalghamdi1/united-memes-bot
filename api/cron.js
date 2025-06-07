// /api/cron.js
import fetch from 'node-fetch';
import { TwitterApi } from 'twitter-api-v2';

const HF_API_KEY = process.env.HF_API_KEY;
const TWITTER_CLIENT = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET
});

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Scrape Twitter Trends from trends24.in (USA)
    const html = await fetch('https://trends24.in/united-states/').then(r => r.text());
    const matches = [...html.matchAll(/\/hashtag\/([^\"]+)/g)].map(m => decodeURIComponent(m[1].replace(/\+/g, ' '))).slice(0, 3);
    const topic = matches[0] || 'USA memes';

    // 2. Generate funny tweet
    const textRes = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: `Write a super funny tweet in American Gen Z slang about ${topic}` })
    });
    const textData = await textRes.json();
    const tweetText = textData[0]?.generated_text?.slice(0, 280) || `Meme time about ${topic}`;

    // 3. Generate meme image
    const imgRes = await fetch("https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: `A hilarious cartoon meme in Simpsons style about ${topic}` })
    });

    const imgArrayBuffer = await imgRes.arrayBuffer();
    const imgBuffer = Buffer.from(imgArrayBuffer);
    if (!imgBuffer || imgBuffer.length < 1000) throw new Error("Image generation failed or returned empty.");

    // 4. Upload to file.io
    const uploadRes = await fetch("https://file.io/?expires=1d", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.append("file", new Blob([imgBuffer]), "meme.png");
        return form;
      })()
    });

    const uploadData = await uploadRes.json();
    const imgURL = uploadData.link || '';
    if (!imgURL) throw new Error("file.io upload failed");

    // 5. Post to Twitter
    await TWITTER_CLIENT.v2.tweet({
      text: `${tweetText}\n\n${imgURL}\n\n#${topic.replace(/\s+/g, '')} #meme #USA 😂`
    });

    res.status(200).json({ success: true, topic, tweetText, imgURL });

  } catch (err) {
    console.error("❌ Meme bot error:", err);
    res.status(500).json({ error: err.message });
  }
}
