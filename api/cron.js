// /api/cron.js — Twitter OAuth 1.0a, no Bearer Token used
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
        "Authorization": `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: `Write a darkly funny tweet in Gen Z American slang about ${topic}` })
    });

    const textRaw = await textRes.text();
    let tweetText;
    try {
      const parsed = JSON.parse(textRaw);
      tweetText = parsed[0]?.generated_text?.slice(0, 280) || `Dark meme time about ${topic}`;
    } catch (e) {
      console.error("⚠️ Failed to parse tweet response:", textRaw);
      tweetText = `When ${topic} hits different 😂`;
    }
    console.log("✅ Generated tweet:", tweetText);

    let imgURL = null;
    try {
      console.log("🟡 Generating meme image...");
      const imgRes = await fetch("https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: `A Family Guy-style cartoon meme about ${topic}` })
      });

      const imgArrayBuffer = await imgRes.arrayBuffer();
      const imgBase64 = Buffer.from(imgArrayBuffer).toString("base64");
      if (imgBase64.length < 1000) throw new Error("Empty image base64");

      console.log("🟡 Uploading image to Imgur...");
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
      console.log("✅ Imgur image uploaded:", imgURL);
    } catch (imgErr) {
      console.warn("⚠️ Image generation failed, posting without image.", imgErr);
    }

    const finalTweet = `${tweetText}${imgURL ? `\n\n${imgURL}` : ''}\n\n#${topic.replace(/\s+/g, '')} #meme #usa 😂`;
    console.log("✅ Final tweet text:", finalTweet);

    // Prepare OAuth 1.0a - no Bearer Token
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

    const tweetURL = 'https://api.twitter.com/1.1/statuses/update.json';
    const request_data = {
      url: tweetURL,
      method: 'POST',
      data: { status: finalTweet },
    };

    const authHeader = oauth.toHeader(oauth.authorize(request_data, token));
    const tweetRes = await fetch(tweetURL, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ status: finalTweet })
    });

    const tweetResult = await tweetRes.json();
    if (!tweetResult.id_str) throw new Error("Tweet failed");
    console.log("✅ Tweet posted!", tweetResult);

    res.status(200).json({ success: true, topic, tweetText, imgURL });
  } catch (err) {
    console.error("❌ Cron error:", err);
    res.status(500).json({ error: err.message });
  }
}
