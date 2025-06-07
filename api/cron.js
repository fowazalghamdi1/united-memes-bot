// /api/cron.js — Fully logged, bulletproof meme bot
import crypto from 'crypto';
import OAuth from 'oauth-1.0a';

export default async function handler(req, res) {
  try {
    console.log("🟡 Fetching Twitter trends...");
    const html = await fetch('https://trends24.in/united-states/').then(r => r.text());
    const matches = [...html.matchAll(/\/hashtag\/([^\"]+)/g)].map(m => decodeURIComponent(m[1].replace(/\+/g, ' '))).slice(0, 3);
    const topic = matches[0] || 'USA memes';
    console.log("✅ Top trends:", matches);

    console.log("🟡 Generating tweet text...");
    const textRes = await fetch("https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct", {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: `Write a hilarious dark meme tweet in Gen Z American slang about ${topic}` }),
    });

    const textRaw = await textRes.text();
    let tweetText;
    try {
      const parsed = JSON.parse(textRaw);
      tweetText = parsed[0]?.generated_text?.slice(0, 280) || `When ${topic} hits 😂`;
    } catch {
      tweetText = `When ${topic} hits 😂`;
    }
    console.log("✅ Generated tweet text:", tweetText);

    let imgURL = null;
    try {
      console.log("🟡 Generating meme image...");
      const imgRes = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: `A meme in Family Guy or South Park cartoon style about ${topic}, funny, trending, Twitter meme format`,
        }),
      });

      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      if (base64.length < 10000) throw new Error("Low quality image");

      console.log("🟡 Uploading image to Imgur...");
      const upload = await fetch("https://api.imgur.com/3/image", {
        method: "POST",
        headers: {
          Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ image: base64 }),
      });

      const result = await upload.json();
      imgURL = result?.data?.link;
      console.log("✅ Image URL:", imgURL);
    } catch (err) {
      console.warn("⚠️ Image skipped:", err.message);
    }

    const finalTweet = `${tweetText}${imgURL ? `\n\n${imgURL}` : ''}\n\n#${topic.replace(/\s+/g, '')} #meme #usa 😂`;

    console.log("✅ Preparing to tweet:", finalTweet);

    if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_ACCESS_TOKEN) {
      throw new Error("Missing Twitter credentials");
    }

    const oauth = new OAuth({
      consumer: {
        key: process.env.TWITTER_API_KEY,
        secret: process.env.TWITTER_API_SECRET,
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });

    const token = {
      key: process.env.TWITTER_ACCESS_TOKEN,
      secret: process.env.TWITTER_ACCESS_SECRET,
    };

    const tweetURL = "https://api.twitter.com/1.1/statuses/update.json";
    const request_data = {
      url: tweetURL,
      method: "POST",
      data: { status: finalTweet },
    };

    const authHeader = oauth.toHeader(oauth.authorize(request_data, token));

    const tweetRes = await fetch(tweetURL, {
      method: "POST",
      headers: {
        ...authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ status: finalTweet }),
    });

    const result = await tweetRes.json();
    console.log("🟢 Twitter Response:", result);

    if (!result.id_str) throw new Error("Tweet failed - invalid credentials or rejected content");

    res.status(200).json({ success: true, topic, tweet: finalTweet, url: result });
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
