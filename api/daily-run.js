// api/daily-run.js
const fetch = require('node-fetch');

const HF_KEY = process.env.HF_KEY;
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID;
const BEARER = process.env.TWITTER_BEARER;
const KEY = process.env.TWITTER_KEY;
const SECRET = process.env.TWITTER_SECRET;
const ACCESS = process.env.TWITTER_ACCESS;
const ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET;

module.exports = async (req, res) => {
  try {
    // 1. Get top 3 trends
    const trendsHtml = await fetch('https://corsproxy.io/?https://trends24.in/united-states/').then(r => r.text());
    const tags = [...trendsHtml.matchAll(/\/hashtag\/([^\"]+)/g)]
      .map(m => '#' + decodeURIComponent(m[1].replace(/\+/g, ' '))).slice(0, 3);

    const posts = [];

    for (let tag of tags) {
      // 2. Generate funny tweet text
      const prompt = `Write a super funny, sarcastic viral tweet using US Gen Z slang about ${tag}`;
      const tweetRes = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
        method: 'POST',
        headers: {
          "Authorization": `Bearer ${HF_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: prompt })
      });
      const tweetData = await tweetRes.json();
      const tweetText = tweetData[0]?.generated_text || `Can't even make a meme for ${tag} 😂`;

      // 3. Generate meme image
      const imagePrompt = `A cartoon meme in the style of Simpsons or South Park, about ${tag}`;
      const imageRes = await fetch("https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${HF_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ inputs: imagePrompt })
      });
      const imageBlob = await imageRes.blob();
      const imgBuffer = await imageBlob.arrayBuffer();

      // 4. Upload image to Imgur
      const uploadRes = await fetch("https://api.imgur.com/3/image", {
        method: 'POST',
        headers: {
          Authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
        },
        body: Buffer.from(imgBuffer)
      });
      const imgurData = await uploadRes.json();
      const imageUrl = imgurData?.data?.link;

      // 5. Post to Twitter
      const tweetBody = {
        status: `${tweetText}\n\n${tag}`,
        media_urls: [imageUrl]
      };

      const tweetResp = await fetch("https://api.twitter.com/1.1/statuses/update.json", {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${BEARER}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: tweetBody.status
        })
      });

      posts.push({ tag, tweetText, imageUrl });
    }

    res.status(200).json({ message: 'Daily memes posted!', posts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to post memes' });
  }
};
