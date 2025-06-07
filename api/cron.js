import crypto from 'crypto';

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
      tweetText = parsed[0]?.generated_text?.slice(0, 200) || `Dark meme time about ${topic}`;
    } catch (e) {
      tweetText = `When ${topic} hits different 😂`;
    }

    console.log("🟡 Generating meme image...");
    let imgURL = null;
    try {
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
      if (imgBase64.length < 1000) throw new Error("Empty image");

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
    } catch (e) {
      console.warn("⚠️ Image failed, tweet will be text-only");
    }

    const finalTweet = `${tweetText}${imgURL ? `\n\n${imgURL}` : ''}\n\n#${topic.replace(/\s+/g, '')} #usa #funny`;

    // 🟡 SIGNATURE for OAuth 1.0a
    const oauth = {
      oauth_consumer_key: process.env.TWITTER_APP_KEY,
      oauth_token: process.env.TWITTER_ACCESS_TOKEN,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_timestamp: Math.floor(Date.now() / 1000),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_version: '1.0'
    };

    const params = {
      status: finalTweet,
      ...oauth
    };

    const encode = str => encodeURIComponent(str).replace(/[!*()']/g, c => '%' + c.charCodeAt(0).toString(16));
    const baseString = 'POST&' + encode('https://api.twitter.com/1.1/statuses/update.json') + '&' +
      encode(Object.keys(params).sort().map(k => `${encode(k)}=${encode(params[k])}`).join('&'));
    const signingKey = `${encode(process.env.TWITTER_APP_SECRET)}&${encode(process.env.TWITTER_ACCESS_SECRET)}`;
    oauth.oauth_signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

    const authHeader = 'OAuth ' + Object.entries(oauth)
      .map(([k, v]) => `${encode(k)}="${encode(v)}"`).join(', ');

    console.log("🟡 Posting to Twitter...");
    const tweetRes = await fetch('https://api.twitter.com/1.1/statuses/update.json', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `status=${encodeURIComponent(finalTweet)}`
    });

    const tweetData = await tweetRes.json();
    if (!tweetData?.id_str) throw new Error("Tweet failed");
    console.log("✅ Tweet posted!");

    res.status(200).json({ success: true, topic, finalTweet, tweetURL: `https://twitter.com/user/status/${tweetData.id_str}` });

  } catch (err) {
    console.error("❌ Final Error:", err);
    res.status(500).json({ error: err.message });
  }
}
