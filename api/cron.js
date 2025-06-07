import crypto from 'crypto';

export default async function handler(req, res) {
  const {
    TWITTER_APP_KEY,
    TWITTER_APP_SECRET,
    TWITTER_ACCESS_TOKEN,
    TWITTER_ACCESS_SECRET,
    HF_API_KEY,
    IMGUR_CLIENT_ID
  } = process.env;

  const encode = encodeURIComponent;

  const percentEncode = str => encode(str).replace(/[!*()']/g, c => '%' + c.charCodeAt(0).toString(16));

  const generateOAuthHeader = (text) => {
    const oauth = {
      oauth_consumer_key: TWITTER_APP_KEY,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000),
      oauth_token: TWITTER_ACCESS_TOKEN,
      oauth_version: '1.0',
    };

    const baseParams = {
      ...oauth,
      status: text,
    };

    const baseString = 'POST&' + encode('https://api.twitter.com/1.1/statuses/update.json') + '&' +
      encode(Object.keys(baseParams).sort().map(k => `${percentEncode(k)}=${percentEncode(baseParams[k])}`).join('&'));

    const signingKey = `${encode(TWITTER_APP_SECRET)}&${encode(TWITTER_ACCESS_SECRET)}`;
    const oauthSignature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
    oauth.oauth_signature = oauthSignature;

    const authHeader = 'OAuth ' + Object.keys(oauth)
      .sort()
      .map(k => `${percentEncode(k)}="${percentEncode(oauth[k])}"`)
      .join(', ');

    return authHeader;
  };

  try {
    const topic = "Elon vs Apple";

    const tweetText = `When ${topic} feels like a cage match between iPhones and rockets 🚀📱😂`;

    const authHeader = generateOAuthHeader(tweetText);

    const tweetRes = await fetch('https://api.twitter.com/1.1/statuses/update.json', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `status=${encodeURIComponent(tweetText)}`
    });

    const tweetData = await tweetRes.json();

    if (!tweetData.id_str) throw new Error("Tweet failed");

    res.status(200).json({ success: true, tweet: tweetText, tweetData });
  } catch (err) {
    console.error("❌ Error posting tweet:", err);
    res.status(500).json({ error: err.message });
  }
}
