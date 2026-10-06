export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      First_Name,
      Last_Name,
      Company,
      Secondary_Email,
      Lead_Status,
      Designation,
      Lead_Source = 'Hiring Page',
      Page_URL
    } = req.body;

    const leadRecord = {
      First_Name: First_Name || '',
      Last_Name: Last_Name || 'Lead',
      Company: Company || 'Not Specified',
      Secondary_Email: Secondary_Email || '',
      Lead_Status: Lead_Status || '',
      Designation: Designation || '',
      Lead_Source: Lead_Source
    };

    // Option A: If a direct Webhook URL (Zoho Flow, Zapier, Make, etc.) is configured
    if (process.env.ZOHO_WEBHOOK_URL) {
      const webhookRes = await fetch(process.env.ZOHO_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...leadRecord, Page_URL })
      });
      const webhookData = await webhookRes.text();
      return res.status(200).json({ success: true, source: 'webhook', data: webhookData });
    }

    // Option B: Zoho CRM REST API via OAuth (accounts.zoho.in)
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;
    const zohoDomain = process.env.ZOHO_DOMAIN || 'zoho.in'; // Default to zoho.in (India DC)

    if (clientId && clientSecret && refreshToken) {
      // 1. Get fresh access token from refresh token
      const tokenUrl = `https://accounts.${zohoDomain}/oauth/v2/token`;
      const tokenParams = new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token'
      });

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        console.error('Failed to get Zoho access token:', tokenData);
        return res.status(500).json({ error: 'Zoho Auth failed', details: tokenData });
      }

      // 2. Insert Lead into Zoho CRM
      const crmApiUrl = `https://www.zohoapis.${zohoDomain}/crm/v2/Leads`;
      const crmRes = await fetch(crmApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${tokenData.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: [leadRecord],
          trigger: ['approval', 'workflow', 'blueprint']
        })
      });

      const crmData = await crmRes.json();
      return res.status(200).json({ success: true, source: 'zoho_api', result: crmData });
    }

    // Option C: Submit directly to Zoho CRM Web-to-Lead endpoint
    const formParams = new URLSearchParams({
      'xnQsjsdp': 'c3da59e9faefad6b8e68c4f5ecd7ba5f65b80c0fcdc9976dc5bd154c2631d632',
      'zc_gad': '',
      'xmIwtLD': '1aa92cb9919038d28fdce860b8de87fbb32640a4147dc893d88a1c8fc12779c11df7f386e52ee35f0dc0e861206c02f8',
      'actionType': 'TGVhZHM=',
      'returnURL': Page_URL || 'https://theconverseai.com/',
      'First Name': First_Name || '',
      'Last Name': Last_Name || 'Lead',
      'Company': Company || 'Not Specified',
      'Email': Secondary_Email || '',
      'Secondary Email': Secondary_Email || '',
      'Lead Status': Lead_Status || '',
      'Designation': Designation || '',
      'Twitter': Page_URL || '',
      'aG9uZXlwb3Q': ''
    });

    const webFormRes = await fetch('https://crm.zoho.in/crm/WebToLeadForm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formParams
    });

    return res.status(200).json({
      success: true,
      source: 'web_to_lead',
      status: webFormRes.status
    });

  } catch (error) {
    console.error('Error submitting lead to Zoho CRM:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
