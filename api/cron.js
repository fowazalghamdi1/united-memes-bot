import crypto from 'crypto';

export default async function handler(req, res) {
  try {
    console.log("🟡 Fetching trends...");
    const html = await fetch('https://trends24.in/united-states/').then(r => r.text());
    const matches = [...html.matchAll(/\/hashtag\/([^\"]+)/g)].map(m => decodeURIComponent(m[1].replace(/\+/g, ' '))).slice(0, 3);
    const topic = matches[0] || 'USA memes';

    console.log("🟡 Generating tweet text...");
    const textRes = await fetch("https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct", {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: `Write a darkly funny tweet in Gen Z American slang about ${topic}` })
    });

    const raw = await textRes.text();
    let tweetText;
    try {
      const parsed = JSON.parse(raw);
      tweetText = parsed[0]?.generated_text?.slice(0, 220) || `Meme drop on ${topic}`;
    } catch {
      tweetText = `Meme drop on ${topic}`;
    }

    console.log("🟡 Generating meme image...");
    const imgRes = await fetch("https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: `A Family Guy-style cartoon meme about ${topic}` })
    });
    const imgBuf = await imgRes.arrayBuffer();
    const imgBase64 = Buffer.from(imgBuf).toString("base64");

    console.log("🟡 Uploading to Imgur...");
    const imgurRes = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: {
        "Authorization": `Client-ID ${process.env.IMGUR_CLIENT_ID}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ image: imgBase64 })
    });
    const imgurData = await imgurRes.json();
    const imgURL = imgurData?.data?.link || '';

    const finalTweet = `${tweetText}\n\n${imgURL}\n\n#${topic.replace(/\s+/g, '')} #meme #usa 😂`;

    // 🔐 Manual OAuth 1.0a signing
    const oauth = {
      oauth_consumer_key: process.env.TWITTER_APP_KEY,
      oauth_token: process.env.TWITTER_ACCESS_TOKEN,
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_signature_method: "HMAC-SHA1",
      oauth_version: "1.0"
    };

    const encode = str => encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16));
    const baseParams = { ...oauth, status: finalTweet };
    const baseString = 'POST&' + encode('https://api.twitter.com/1.1/statuses/update.json') + '&' +
      encode(Object.keys(baseParams).sort().map(k => `${encode(k)}=${encode(baseParams[k])}`).join('&'));
    const signingKey = `${encode(process.env.TWITTER_APP_SECRET)}&${encode(process.env.TWITTER_ACCESS_SECRET)}`;
    oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

    const authHeader = 'OAuth ' + Object.keys(oauth)
      .map(k => `${encode(k)}="${encode(oauth[k])}"`).join(', ');

    console.log("🟡 Posting to Twitter...");
    const tweetRes = await fetch('https://api.twitter.com/1.1/statuses/update.json', {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `status=${encodeURIComponent(finalTweet)}`
    });

    const result = await tweetRes.json();
    if (!result.id_str) throw new Error("Tweet failed");

    console.log("✅ Tweet posted!");
    res.status(200).json({ tweet: result });

  } catch (err) {
    console.error("❌ Final error:", err);
    res.status(500).json({ error: err.message });
  }
}
