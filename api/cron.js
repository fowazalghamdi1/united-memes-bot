// /api/cron.js — uses Twitter API v2 with OAuth1 and full error handling
import { TwitterApi } from 'twitter-api-v2';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    const html = await fetch('https://trends24.in/united-states/').then(r => r.text());
    const matches = [...html.matchAll(/\/hashtag\/([^\"]+)/g)].map(m => decodeURIComponent(m[1].replace(/\+/g, ' '))).slice(0, 3);
    const topic = matches[0] || 'USA memes';

    const textRes = await fetch("https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct", {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: `Write a funny tweet in American Gen Z slang about ${topic}` })
    });

    const textRaw = await textRes.text();
    let tweetText;
    try {
      const parsed = JSON.parse(textRaw);
      tweetText = parsed[0]?.generated_text?.slice(0, 280) || `Another meme on ${topic}`;
    } catch {
      tweetText = `Another meme on ${topic}`;
    }

    let imgURL = null;
    try {
      const imgRes = await fetch("https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: `A funny South Park-style cartoon about ${topic}` })
      });

      const imgArrayBuffer = await imgRes.arrayBuffer();
      const imgBase64 = Buffer.from(imgArrayBuffer).toString("base64");

      const imgurRes = await fetch("https://api.imgur.com/3/image", {
        method: "POST",
        headers: {
          "Authorization": `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ image: imgBase64 })
      });

      const imgurData = await imgurRes.json();
      imgURL = imgurData?.data?.link;
    } catch (err) {
      console.warn("⚠️ Image upload failed:", err.message);
    }

    const tweetFinal = `${tweetText}${imgURL ? `\n\n${imgURL}` : ''}\n\n#${topic.replace(/\s+/g, '')} #meme #usa 😂`;

    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_APP_KEY,
      appSecret: process.env.TWITTER_APP_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET
    });

    const tweet = await twitterClient.v2.tweet(tweetFinal);

    res.status(200).json({ success: true, tweet });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
}
