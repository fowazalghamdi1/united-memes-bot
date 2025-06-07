// /api/cron.js — dependency-free, native fetch version
export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log("🟡 Fetching Twitter trends...");
    const html = await fetch('https://trends24.in/united-states/').then(r => r.text());
    const matches = [...html.matchAll(/\/hashtag\/([^\"]+)/g)].map(m => decodeURIComponent(m[1].replace(/\+/g, ' '))).slice(0, 3);
    const topic = matches[0] || 'USA memes';
    console.log("✅ Top trends:", matches);

    console.log("🟡 Generating tweet text...");
    const textRes = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: `Write a hilarious dark comedy tweet in Gen Z American slang about ${topic}` })
    });
    const textJson = await textRes.json();
    const tweetText = textJson[0]?.generated_text?.slice(0, 280) || `Dark meme time about ${topic}`;
    console.log("✅ Generated tweet:", tweetText);

    console.log("🟡 Generating meme image...");
    const imgRes = await fetch("https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: `A funny cartoon meme in Family Guy style about ${topic}` })
    });

    const imgArrayBuffer = await imgRes.arrayBuffer();
    const imgBase64 = Buffer.from(imgArrayBuffer).toString("base64");
    if (imgBase64.length < 1000) throw new Error("Image generation failed");

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
    const imgURL = imgurData?.data?.link;
    if (!imgURL) throw new Error("Failed to upload to Imgur");
    console.log("✅ Uploaded to Imgur:", imgURL);

    console.log("🟡 Posting to Twitter...");
    const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: `${tweetText}\n\n${imgURL}\n\n#${topic.replace(/\s+/g, '')} #meme #usa 😂` })
    });

    const tweetResult = await tweetRes.json();
    if (!tweetResult.data) throw new Error("Tweet failed");
    console.log("✅ Tweet posted!");

    res.status(200).json({ success: true, topic, tweetText, imgURL });

  } catch (err) {
    console.error("❌ Cron error:", err);
    res.status(500).json({ error: err.message });
  }
}
