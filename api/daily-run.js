const fetch = require('node-fetch');
const FormData = require('form-data');

const HF_KEY = process.env.HF_KEY;
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID;
const BEARER = process.env.TWITTER_BEARER;
const KEY = process.env.TWITTER_KEY;
const SECRET = process.env.TWITTER_SECRET;
const ACCESS = process.env.TWITTER_ACCESS;
const ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET;

module.exports = async (req, res) => {
  try {
    // 1. Scrape top 3 trending hashtags in the USA
    const trendsHtml = await fetch('https://corsproxy.io/?https://trends24.in/united-states/').then(r => r.text());
    const tags = [...trendsHtml.matchAll(/\/hashtag\/([^\"]+)/g)]
      .map(m => '#' + decodeURIComponent(m[1].replace(/\+/g, ' ')))
      .slice(0, 3);

    const results = [];

    for (let tag of tags) {
      // 2. Generate funny text with Hugging Face
      const prompt = `Write a super funny, dark, sarcastic viral tweet in US slang about ${tag}`;
      const tweetRes = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HF_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: prompt })
      });
      const tweetData = await tweetRes.json();
      const tweetText = tweetData[0]?.generated_text?.trim().slice(0, 270) || `When in doubt... ${tag} 😂`;

      // 3. Generate meme image
      const imagePrompt = `A hilarious cartoon meme in Simpsons or South Park style about ${tag}`;
      const imageRes = await fetch("https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: imagePrompt })
      });

      const imageBlob = await imageRes.blob();
      const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());

      // 4. Upload to Imgur
      const form = new FormData();
      form.append("image", imageBuffer.toString('base64'));
      const imgurRes = await fetch("https://api.imgur.com/3/image", {
        method: "POST",
        headers: {
          Authorization: `Client-ID ${IMGUR_CLIENT_ID}`
        },
        body: form
      });
      const imgurData = await imgurRes.json();
      const imageUrl = imgurData?.data?.link;

      // 5. Post to Twitter (text + image URL)
      const tweetWithImg = `${tweetText}\n\n${tag}\n${imageUrl}`;
      const postRes = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${BEARER}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: tweetWithImg })
      });

      results.push({ tag, tweet: tweetWithImg, image: imageUrl });
    }

    res.status(200).json({ message: "Daily memes posted!", results });
  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ error: "Something went wrong while posting memes." });
  }
};
