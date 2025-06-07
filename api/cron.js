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
    } catch {
      tweetText = `When ${topic} hits different 😂`;
    }

    let imgURL = null;
    try {
      console.log("🟡 Generating meme image...");
      const imgGen = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: `A meme in Family Guy or South Park cartoon style about ${topic}, funny, trending, viral, Twitter meme format`,
        }),
      });

      const imgBuffer = await imgGen.arrayBuffer();
      const base64 = Buffer.from(imgBuffer).toString("base64");

      if (base64.length < 5000) throw new Error("Image too small");

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
    } catch (err) {
      console.warn("⚠️ Skipping image:", err.message);
    }

    const finalTweet = `${tweetText}${imgURL ? `\n\n${imgURL}` : ''}\n\n#${topic.replace(/\s+/g, '')} #meme #usa 😂`;

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

    const contentType = tweetRes.headers.get('content-type');
    const responseBody = await tweetRes.text();

    if (!contentType?.includes('application/json')) {
      console.error("❌ Twitter raw response:", responseBody);
      throw new Error("Tweet failed: Twitter returned non-JSON");
    }

    const tweetResult = JSON.parse(responseBody);
    if (!tweetResult.id_str) {
      console.error("❌ Twitter error JSON:", tweetResult);
      throw new Error("Tweet failed");
    }

    console.log("✅ Tweet posted successfully:", tweetResult.id_str);
    res.status(200).json({ success: true, tweet: finalTweet });
  } catch (err) {
    console.error("❌ Cron error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
