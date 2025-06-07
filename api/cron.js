// /api/cron.js — updated with fallback image logic + Falcon text model
export default async function handler(req, res) {
  // TEMPORARILY DISABLED AUTH CHECK
  // if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

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

    console.log("🟡 Posting to Twitter...");
    const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: finalTweet })
    });

    const tweetResult = await tweetRes.json();
    if (!tweetResult.data) throw new Error("Tweet failed");
    console.log("✅ Tweet posted!", tweetResult);

    res.status(200).json({ success: true, topic, tweetText, imgURL });

  } catch (err) {
    console.error("❌ Cron error:", err);
    res.status(500).json({ error: err.message });
  }
}
