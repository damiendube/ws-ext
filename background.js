// Background service worker for Wealthsimple ROI Analyzer

// Import the Wealthsimple API library
importScripts('wealthsimple_api.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getAccounts") {
    // Handle getAccounts request
    (async () => {
      try {
        const api = new WealthsimpleAPI();
        const accounts = await api.get_accounts(true, true); // open_only=true, use_cache=true
        sendResponse({ accounts: accounts });
      } catch (error) {
        console.error("Error getting accounts:", error);
        sendResponse({ error: error.message });
      }
    })();
    return true; // Indicates we will send a response asynchronously
  }

  if (request.action === "fetchROIData") {
    // Get the tab - either from sender or by querying with tabId
    const getTab = async () => {
      if (sender.tab) {
        return sender.tab;
      } else if (request.tabId) {
        return await chrome.tabs.get(request.tabId);
      } else {
        // Fallback: get active tab
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        return tab;
      }
    };

    getTab()
      .then(async (tab) => {
        // Initialize the API and set access token from cookies
        const api = new WealthsimpleAPI();
        
        // Get account IDs - if a specific account is selected, use it; otherwise fetch all accounts
        let accountIds = null;
        if (request.accountId && request.accountId !== '') {
          accountIds = [request.accountId];
        } else {
          // Fetch all accounts to get their IDs
          const accounts = await api.get_accounts(true, true); // open_only=true, use_cache=true
          accountIds = accounts.map(account => account.id);
        }
        
        // Call the API method (note: start_date should be a Date object or ISO string)
        const data = await api.get_identity_historical_financials(accountIds, 'CAD', '2025-01-01');
        const rollingWindow = request.rollingWindow || 30; // Default to 30 (monthly) if not provided
        return processROIData(data, rollingWindow);
      })
      .then((data) => sendResponse({ data }))
      .catch((error) => sendResponse({ error: error.message }));
    return true; // Indicates we will send a response asynchronously
  }
});

async function getAccessToken() {
    // Get all cookies for the Wealthsimple domain
    const cookies = await getCookiesForDomain('wealthsimple.com');

    if (!cookies || cookies.length === 0) {
      throw new Error(
        "No cookies found. Please make sure you are logged in to Wealthsimple."
      );
    }

    // Find the cookie with the name "_oauth2_access_v2" and get the value
    const oauth2Cookie = cookies.find((cookie) => cookie.name === "_oauth2_access_v2");
    const access_token = JSON.parse(decodeURIComponent(oauth2Cookie.value))["access_token"];
   
    return access_token;
}

async function getCookiesForDomain(domain) {
  try {
    // Get all cookies for the domain and its parent domains
    const cookies = await chrome.cookies.getAll({ domain: domain });

    // Also try to get cookies for parent domain (e.g., .wealthsimple.com)
    const parentDomain = domain.startsWith(".") ? domain : `.${domain}`;
    const parentCookies = await chrome.cookies.getAll({ domain: parentDomain });

    // Combine and deduplicate cookies
    const allCookies = [...cookies, ...parentCookies];
    const uniqueCookies = [];
    const seen = new Set();

    for (const cookie of allCookies) {
      const key = `${cookie.domain}:${cookie.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueCookies.push(cookie);
      }
    }

    return uniqueCookies;
  } catch (error) {
    console.error("Error getting cookies:", error);
    return [];
  }
}

function getGraphQLEndpoint(domain) {
  // Try to determine the GraphQL endpoint based on the domain
  // Common patterns for Wealthsimple:
  // - https://api.wealthsimple.com/graphql
  // - https://app.wealthsimple.com/graphql
  // - https://wealthsimple.com/graphql
  //
  // Note: You may need to inspect network requests in the browser DevTools
  // to find the actual GraphQL endpoint URL

  if (domain.includes("wealthsimple.com")) {
    // Try common API endpoints
    const possibleEndpoints = [
      "https://api.wealthsimple.com/graphql",
      "https://app.wealthsimple.com/graphql",
      "https://wealthsimple.com/graphql",
      `https://${domain}/graphql`,
    ];

    // Return the first one - you may need to adjust this based on actual endpoint
    return possibleEndpoints[0];
  }

  // Fallback: use the same domain
  return `https://${domain}/graphql`;
}

function buildROIQuery() {
  // GraphQL query to fetch ROI data
  // This needs to be customized based on Wealthsimple's actual GraphQL schema
  return "{\"operationName\":\"FetchAccountCombinedNlv\",\"variables\":{\"ids\":[\"rrsp-o5ecxxbo\",\"tfsa-gzguzdfz\",\"non-registered-dac4_7ym\",\"group-rrsp-ylbehz-n\",\"ca-cash-msb-i5C5bJCn6g\",\"non-registered-rrvdqm6h\",\"ca-cash-msb-gVU38qfIew\",\"ca-credit-card-RnGec1MeWg\",\"non-registered-crypto-GCqXGXSnsA\"]},\"query\":\"query FetchAccountCombinedNlv($ids: [String!]!, $currency: Currency) {\\n  accounts(ids: $ids) {\\n    id\\n    financials {\\n      currentCombined(currency: $currency) {\\n        id\\n        netLiquidationValueV2 {\\n          ...Money\\n          __typename\\n        }\\n        __typename\\n      }\\n      __typename\\n    }\\n    __typename\\n  }\\n}\\n\\nfragment Money on Money {\\n  amount\\n  cents\\n  currency\\n  __typename\\n}\"}";
}

function processROIData(data, rollingWindow = 30) {
  // Process the GraphQL response into chart-friendly format
  // data is an array of historical financial entries from get_identity_historical_financials
  // rollingWindow is the number of days for the rolling window (1=daily, 7=weekly, 30=monthly, 365=yearly)
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error("No historical financial data found");
  }

  // Extract dates and net liquidation values
  const labels = [];
  const values = [];
  
  for (let i = 0; i + rollingWindow < data.length; i+=rollingWindow) {
    const windowStart = i;
    const windowEnd = i + rollingWindow;

    const dataStart = data[windowStart];
    const dataEnd = data[windowEnd];

    const netLiquidationValueDiff = parseFloat(dataEnd.netLiquidationValueV2?.amount || 0) - parseFloat(dataStart.netLiquidationValueV2?.amount || 0);
    const netDepositsDiff = parseFloat(dataEnd.netDepositsV2?.amount || 0) - parseFloat(dataStart.netDepositsV2?.amount || 0);
   
    const roi = (netLiquidationValueDiff - netDepositsDiff) / (parseFloat(dataStart.netLiquidationValueV2?.amount || 0)) * 100.0;
    
    labels.push(dataEnd.date);
    values.push(roi);
  }

  return {
    labels: labels,
    values: values,
  };
}
