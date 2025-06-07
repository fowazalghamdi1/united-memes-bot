// /api/cron.js (CommonJS version)
const fetch = require('node-fetch');
const { TwitterApi } = require('twitter-api-v2');
const FormData = require('form-data');

const HF_API_KEY = process.env.HF_API_KEY;
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID;
const TWITTER_CLIENT = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET
});

module.exports = async (req, res) => {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn("🔒 Unauthorized access attempt");
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log("🟡 Step 1: Fetching Twitter Trends...");
    const html = await fetch('https://trends24.in/united-states/').then(r => r.text());
    const matches = [...html.matchAll(/\/hashtag\/([^\"]+)/g)].map(m => decodeURIComponent(m[1].replace(/\+/g, ' '))).slice(0, 3);
    const topic = matches[0] || 'USA memes';
    console.log("✅ Trends fetched:", matches);

    console.log("🟡 Step 2: Generating tweet text...");
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
    console.log("✅ Tweet text:", tweetText);

    console.log("🟡 Step 3: Generating meme image...");
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
    console.log("✅ Meme image generated");

    console.log("🟡 Step 4: Uploading to Imgur...");
    const form = new FormData();
    form.append("image", imgBuffer.toString('base64'));
    const uploadRes = await fetch("https://api.imgur.com/3/image", {
      method: "POST",
      headers: {
        Authorization: `Client-ID ${IMGUR_CLIENT_ID}`
      },
      body: form
    });

    const uploadData = await uploadRes.json();
    const imgURL = uploadData.data?.link || '';
    if (!imgURL) throw new Error("Imgur upload failed");
    console.log("✅ Image uploaded:", imgURL);

    console.log("🟡 Step 5: Posting to Twitter...");
    await TWITTER_CLIENT.v2.tweet({
      text: `${tweetText}\n\n${imgURL}\n\n#${topic.replace(/\s+/g, '')} #meme #USA 😂`
    });
    console.log("✅ Tweet posted successfully!");

    res.status(200).json({ success: true, topic, tweetText, imgURL });

  } catch (err) {
    console.error("❌ Meme bot error:", err);
    res.status(500).json({ error: err.message });
  }
};
