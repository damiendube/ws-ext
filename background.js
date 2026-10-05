// Background service worker for Wealthsimple ROI Analyzer

// Import the Wealthsimple API library
importScripts('wealthsimple_api.js', 'country_exposure.js');

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
        
        const data = await api.get_identity_historical_financials(accountIds, 'CAD', '2014-01-01', null, null, null, true);
        const history = normalizeHistory(data);

        let allocation = { assets: [], countries: [], unknownSymbols: [], excluded: [] };
        try {
          const accounts = await api.get_accounts(true, true);
          const scopedAccounts = request.accountId
            ? accounts.filter((account) => account.id === request.accountId)
            : accounts;
          const positions = await api.get_identity_positions(accountIds, 'CAD');
          const managedPositions = await positionsForManagedAccounts(api, positions, scopedAccounts);
          allocation = await CountryExposure.buildAllocation(positions.concat(managedPositions), scopedAccounts);
        } catch (error) {
          console.error('Allocation failed:', error);
          allocation.unknownSymbols = ['Holdings could not be loaded'];
        }

        return {
          history,
          assets: {
            labels: allocation.assets.map((slice) => slice.label),
            values: allocation.assets.map((slice) => slice.value),
            percents: allocation.assets.map((slice) => slice.percent),
            otherHoldings: allocation.otherHoldings || [],
          },
          countries: {
            labels: allocation.countries.map((slice) => slice.label),
            values: allocation.countries.map((slice) => slice.value),
            percents: allocation.countries.map((slice) => slice.percent),
            unknownSymbols: allocation.unknownSymbols,
            excluded: allocation.excluded,
          },
        };
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

function coveredAccountIds(positions) {
  const ids = new Set();
  for (const position of positions) {
    for (const account of position.accounts || []) {
      if (account.id) {
        ids.add(account.id);
      }
    }
  }
  return ids;
}

function isManagedAccount(account) {
  const type = `${account.unifiedAccountType || ''} ${account.type || ''}`;
  return /MANAGED|PORTFOLIO/i.test(type);
}

function securityFromAllocation(row) {
  const assetClass = row.target_portfolio_asset_class || {};
  const securities = assetClass.securitiesV2 || [];
  const security = securities.find((item) => item.id === row.preferred_security_id) || securities[0] || {};
  const category = String(assetClass.category || '').toLowerCase();
  const readable = String(assetClass.key || category || 'Holding').replace(/_/g, ' ');
  const name = security.stock?.name || (category === 'gold' ? 'Gold bullion' : readable);
  let securityType = 'EXCHANGE_TRADED_FUND';
  if (category === 'cash') {
    securityType = 'CURRENCY';
  }
  return {
    id: security.id || row.preferred_security_id || assetClass.id || '',
    securityType,
    assetClass: assetClass.key || category,
    stock: {
      name,
      symbol: security.stock?.symbol || '',
      primaryExchange: security.stock?.primaryExchange || '',
    },
  };
}

function positionsFromManagedAccount(account, payload) {
  const edges = payload?.financials?.current?.positions?.edges || [];
  const positions = edges
    .map((edge) => edge.node)
    .filter((node) => node && Number(node.totalValue?.amount) > 0)
    .map((node) => ({ ...node, accounts: [{ id: account.id }] }));
  if (positions.length > 0) {
    return positions;
  }

  const accountValue = Number(account.financials?.currentCombined?.netLiquidationValue?.amount);
  const allocations = payload?.targetPortfolioV2?.assetClassAllocations || [];
  if (!(accountValue > 0) || allocations.length === 0) {
    return [];
  }
  return allocations.map((row) => {
    const weight = Number(row.allocation) / 100;
    return {
      id: `${account.id}-${row.preferred_security_id || row.target_portfolio_asset_class?.key || 'slice'}`,
      accounts: [{ id: account.id }],
      totalValue: { amount: String(accountValue * weight), currency: 'CAD' },
      security: securityFromAllocation(row),
    };
  }).filter((position) => Number(position.totalValue.amount) > 0);
}

async function positionsForManagedAccounts(api, positions, accounts) {
  const covered = coveredAccountIds(positions);
  const seen = new Set(positions.map((position) => position.id).filter(Boolean));
  const extra = [];
  for (const account of accounts) {
    if (!isManagedAccount(account) || covered.has(account.id)) {
      continue;
    }
    const value = Number(account.financials?.currentCombined?.netLiquidationValue?.amount);
    if (!(value > 0)) {
      continue;
    }
    let holdings = [];
    for (const profile of ['trade', 'invest']) {
      try {
        const payload = await api.get_managed_account_holdings(account.id, 'CAD', profile);
        holdings = positionsFromManagedAccount(account, payload);
        if (holdings.length > 0) {
          break;
        }
      } catch (error) {
        console.error('Managed portfolio holdings failed:', account.id, profile, error);
      }
    }
    for (const position of holdings) {
      if (position.id && seen.has(position.id)) {
        continue;
      }
      if (position.id) {
        seen.add(position.id);
      }
      if (!Array.isArray(position.accounts) || position.accounts.length === 0) {
        position.accounts = [{ id: account.id }];
      }
      extra.push(position);
    }
  }
  return extra;
}

function normalizeHistory(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    throw new Error("No historical financial data found");
  }

  return data
    .map((row) => ({
      date: row.date,
      nlv: Number(row.netLiquidationValueV2?.amount),
      deposits: Number(row.netDepositsV2?.amount),
    }))
    .filter((row) => row.date && Number.isFinite(row.nlv) && Number.isFinite(row.deposits))
    .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
