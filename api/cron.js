import { TwitterApi } from 'twitter-api-v2';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    console.log("🟡 Fetching Twitter trends...");
    const html = await fetch('https://trends24.in/united-states/').then(r => r.text());
    const matches = [...html.matchAll(/\/hashtag\/([^\"]+)/g)].map(m => decodeURIComponent(m[1].replace(/\+/g, ' '))).slice(0, 3);
    const topic = matches[0] || 'USA memes';

    console.log("🟡 Generating tweet text...");
    const textRes = await fetch("https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct", {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: `Write a darkly funny tweet in Gen Z American slang about ${topic}` })
    });

    const textRaw = await textRes.text();
    let tweetText;
    try {
      const parsed = JSON.parse(textRaw);
      tweetText = parsed[0]?.generated_text?.slice(0, 280) || `Dark meme time about ${topic}`;
    } catch {
      tweetText = `When ${topic} hits different 😂`;
    }

    let imgURL = null;
    try {
      console.log("🟡 Generating image...");
      const imgRes = await fetch("https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: `A South Park-style meme about ${topic}` })
      });

      const imgBuffer = await imgRes.arrayBuffer();
      const imgBase64 = Buffer.from(imgBuffer).toString("base64");

      const imgurRes = await fetch("https://api.imgur.com/3/image", {
        method: "POST",
        headers: {
          Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ image: imgBase64 })
      });

      const imgurData = await imgurRes.json();
      imgURL = imgurData?.data?.link;
    } catch (imgErr) {
      console.warn("⚠️ Image upload failed:", imgErr.message);
    }

    const finalTweet = `${tweetText}${imgURL ? `\n\n${imgURL}` : ''}\n\n#${topic.replace(/\s+/g, '')} #meme #usa 😂`;

    console.log("🟡 Posting to Twitter...");
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_APP_KEY,
      appSecret: process.env.TWITTER_APP_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
      accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });

    const tweet = await twitterClient.v2.tweet(finalTweet);

    console.log("✅ Tweet posted:", tweet);
    res.status(200).json({ success: true, topic, tweetText, imgURL, tweet });

  } catch (err) {
    console.error("❌ Cron error:", err);
    res.status(500).json({ error: err.message });
  }
}
