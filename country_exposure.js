// Country look-through and asset classification for the portfolio view.
// Issuer pages are fetched from the service worker. Results are cached.

const COUNTRY_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const CATALOG_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

const BOND_TICKERS = new Set([
  'ZAG', 'VAB', 'XBB', 'TLT', 'ZDB', 'VLB', 'XLB', 'PGL', 'HBB', 'ZFL',
  'XSH', 'ZCS', 'VSC', 'BND', 'AGG', 'VBU', 'VBG', 'VGAB', 'VSB', 'XQB',
  'ZFM', 'ZST', 'CLF', 'XBB', 'ZAG', 'HBB', 'VBG', 'CBO',
]);

const GOLD_TICKERS = new Set([
  'CGL', 'CGL.C', 'CGLC', 'GLD', 'IAU', 'GLDM', 'BAR', 'SGOL',
  'KILO', 'KILO.B', 'PHYS', 'MNT', 'VALT',
]);

const ONE_COUNTRY_FUNDS = {
  ZAG: 'Canada',
  ZCB: 'Canada',
  ZCS: 'Canada',
  ZDB: 'Canada',
  HBB: 'Canada',
  HXT: 'Canada',
  HXCN: 'Canada',
  QCN: 'Canada',
  QUU: 'United States',
  ZHY: 'United States',
  ZUAG: 'United States',
  ZSP: 'United States',
};

// Same published index when the issuer page is blocked.
const INDEX_PROXIES = {
  ZEA: 'IEFA',
};

const ISHARES_CATALOGS = [
  {
    key: 'ca',
    origin: 'https://www.blackrock.com',
    catalogUrl: 'https://www.blackrock.com/ca/investors/en/product-screener/product-screener-v3.1.jsn?dcrPath=%2Ftemplatedata%2Fconfig%2Fproduct-screener-v3%2Fdata%2Fen%2Fca-one%2Fproduct-screener-backend-config&siteEntryPassthrough=true',
  },
  {
    key: 'us',
    origin: 'https://www.ishares.com',
    catalogUrl: 'https://www.ishares.com/us/product-screener/product-screener-v3.1.jsn?dcrPath=%2Ftemplatedata%2Fconfig%2Fproduct-screener-v3%2Fdata%2Fen%2Fus-ishares%2Fishares-product-screener-backend-config&siteEntryPassthrough=true',
  },
];

const COUNTRY_ALIASES = {
  'united states of america': 'United States',
  'united states': 'United States',
  'usa': 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'us': 'United States',
  'uk': 'United Kingdom',
  'u.k.': 'United Kingdom',
  'great britain': 'United Kingdom',
  'republic of korea': 'South Korea',
  'korea': 'South Korea',
  'south korea': 'South Korea',
  'czech republic': 'Czechia',
  'russian federation': 'Russia',
  'taiwan, province of china': 'Taiwan',
  'hong kong sar': 'Hong Kong',
  'china, people\'s republic': 'China',
};

function normalizeSymbol(symbol) {
  return String(symbol || '').trim().toUpperCase();
}

function normalizeCountry(name) {
  const raw = String(name || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw === '-' || raw === '—' || /^cash$/i.test(raw)) {
    return null;
  }
  const alias = COUNTRY_ALIASES[raw.toLowerCase()];
  if (alias) {
    return alias;
  }
  return raw.split(' ').map((word) => {
    if (!word) return word;
    if (word.length <= 3 && word === word.toUpperCase()) {
      return word;
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

function toFractions(totals) {
  const sum = Object.values(totals).reduce((acc, value) => acc + value, 0);
  if (!(sum > 0)) {
    return null;
  }
  const fractions = {};
  if (sum > 100.5) {
    for (const [country, value] of Object.entries(totals)) {
      fractions[country] = value / sum;
    }
    return fractions;
  }
  for (const [country, value] of Object.entries(totals)) {
    fractions[country] = value / 100;
  }
  const covered = Object.values(fractions).reduce((acc, value) => acc + value, 0);
  if (covered < 0.995) {
    fractions.Other = (fractions.Other || 0) + (1 - covered);
  }
  return fractions;
}

function parsePercent(text) {
  const match = String(text).replace(/,/g, '').match(/-?[0-9]+(?:\.[0-9]+)?/);
  if (!match) {
    return null;
  }
  return Number(match[0]);
}

function isGold(symbol, name) {
  const ticker = normalizeSymbol(symbol).replace(/\.UN$/, '');
  if (GOLD_TICKERS.has(ticker) || GOLD_TICKERS.has(normalizeSymbol(symbol))) {
    return true;
  }
  return /\b(gold bullion|physical gold|gold trust|gold shares)\b/i.test(name || '');
}

function isBond(symbol, name, securityType) {
  const type = String(securityType || '').toUpperCase();
  if (type === 'BOND' || type === 'FIXED_INCOME') {
    return true;
  }
  const ticker = normalizeSymbol(symbol);
  if (BOND_TICKERS.has(ticker)) {
    return true;
  }
  return /\b(bond|bonds|treasury|treasuries|fixed income)\b/i.test(name || '');
}

function holdingLabel(position) {
  const security = position.security || {};
  const stock = security.stock || {};
  const symbol = normalizeSymbol(stock.symbol);
  const name = String(stock.name || '').trim();
  if (symbol && name) {
    return `${symbol} (${name})`;
  }
  if (symbol) {
    return symbol;
  }
  if (name) {
    return name;
  }
  const type = security.securityType ? String(security.securityType) : '';
  if (security.id && type) {
    return `${security.id} (${type})`;
  }
  return security.id || type || 'Unclassified';
}

function classifyAsset(position) {
  const security = position.security || {};
  const stock = security.stock || {};
  const symbol = stock.symbol || '';
  const name = stock.name || '';
  const type = String(security.securityType || '').toUpperCase();
  const id = String(security.id || '');

  if (id === 'sec-c-cad' || id === 'sec-c-usd' || type === 'CURRENCY' || type === 'CASH') {
    return 'Cash';
  }
  if (type === 'CRYPTO' || type === 'CRYPTOCURRENCY') {
    return 'Crypto';
  }
  const assetClass = String(security.assetClass || '').toLowerCase();
  if (assetClass === 'cash' || assetClass === 'cash_equivalent') {
    return 'Cash';
  }
  if (assetClass === 'cryptocurrencies') {
    return 'Crypto';
  }
  if (assetClass === 'gold' || assetClass === 'metals' || isGold(symbol, name)) {
    return 'Other';
  }
  if (/bond|fixed_income|credit/.test(assetClass) || isBond(symbol, name, type)) {
    return 'Bonds';
  }
  if (type === 'OPTION') {
    return 'Other';
  }
  if (type === 'EQUITY' || type === 'EXCHANGE_TRADED_FUND' || type === 'ETF' || type === 'MUTUAL_FUND' || symbol) {
    return 'Stocks';
  }
  return 'Other';
}

function isFund(position) {
  const security = position.security || {};
  const stock = security.stock || {};
  const type = String(security.securityType || '').toUpperCase();
  const name = stock.name || '';
  if (type === 'EXCHANGE_TRADED_FUND' || type === 'ETF' || type === 'MUTUAL_FUND') {
    return true;
  }
  return /\bETF\b|INDEX FUND|ISHARES|VANGUARD|HORIZONS|GLOBAL X|\bBMO\b/i.test(name);
}

function issuerOf(name, symbol) {
  const label = `${name || ''}`.toLowerCase();
  const ticker = normalizeSymbol(symbol);
  if (label.includes('ishares') || label.includes('blackrock')) {
    return 'ishares';
  }
  if (label.includes('vanguard')) {
    return 'vanguard';
  }
  if (/\bbmo\b/.test(label)) {
    return 'bmo';
  }
  if (label.includes('global x') || label.includes('horizons')) {
    return 'globalx';
  }
  if (['HXT', 'HXCN', 'HXS', 'HXDM', 'HBB', 'HXQ'].includes(ticker)) {
    return 'globalx';
  }
  return null;
}

function isUsListing(exchange, mic) {
  const text = `${exchange || ''} ${mic || ''}`.toUpperCase();
  return /NYSE|NASDAQ|ARCA|XNYS|XNAS|ARCX|BATS|XASE|NYSE ARCA/.test(text);
}

function yahooSymbol(symbol, exchange, mic) {
  let ticker = normalizeSymbol(symbol);
  const embedded = ticker.match(/^(.*)\.(TO|NE|CN)$/);
  let suffix = embedded ? embedded[2] : '';
  if (embedded) {
    ticker = embedded[1];
  }
  // Yahoo uses a hyphen for a share class (BRK.B → BRK-B) and a dot only for the exchange.
  ticker = ticker.replace(/\./g, '-');
  if (!suffix) {
    const text = `${exchange || ''} ${mic || ''}`.toUpperCase();
    if (/TSX|XTSE|XTSX|TORONTO|TSXV|VENTURE/.test(text)) {
      suffix = 'TO';
    } else if (/NEO|NEOE|AEQUITAS/.test(text)) {
      suffix = 'NE';
    } else if (/CSE|XCNQ/.test(text)) {
      suffix = 'CN';
    }
  }
  return suffix ? `${ticker}.${suffix}` : ticker;
}

function positionValue(position) {
  const amount = Number(position.totalValue?.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return 0;
  }
  return amount;
}

function accountLiquidationValue(account) {
  const amount = Number(account.financials?.currentCombined?.netLiquidationValue?.amount);
  return Number.isFinite(amount) ? amount : 0;
}

async function fetchText(url, timeoutMs = 20000) {
  const response = await fetch(url, {
    credentials: 'include',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function fetchJson(url, timeoutMs = 20000) {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });
}

async function readCache(key) {
  const stored = await storageGet(['countryExposureCache']);
  const cache = stored.countryExposureCache || {};
  const entry = cache[key];
  if (!entry || Date.now() - entry.at > COUNTRY_CACHE_MS) {
    return null;
  }
  return entry.weights;
}

async function writeCache(key, weights) {
  const stored = await storageGet(['countryExposureCache']);
  const cache = stored.countryExposureCache || {};
  cache[key] = { at: Date.now(), weights: weights };
  await storageSet({ countryExposureCache: cache });
}

function blackrockHolding(row) {
  if (row[3] && typeof row[3] === 'object' && typeof row[6] === 'string') {
    return {
      ticker: row[0],
      name: row[1] || '',
      weight: Number(row[3].raw),
      country: row[6],
    };
  }
  if (row[2] && typeof row[2] === 'object' && typeof row[5] === 'string') {
    return {
      ticker: row[0],
      name: row[1] || '',
      weight: Number(row[2].raw),
      country: row[5],
    };
  }
  return null;
}

function weightsFromBlackrockRows(rows) {
  const totals = {};
  for (const row of rows) {
    const holding = blackrockHolding(row);
    if (!holding) {
      continue;
    }
    const country = normalizeCountry(holding.country);
    if (!country || !Number.isFinite(holding.weight) || holding.weight === 0) {
      continue;
    }
    totals[country] = (totals[country] || 0) + holding.weight;
  }
  return toFractions(totals);
}

function rowsLookLikeFunds(rows) {
  if (!rows || rows.length === 0 || rows.length > 40) {
    return false;
  }
  const holdings = rows.map(blackrockHolding).filter(Boolean);
  if (holdings.length === 0) {
    return false;
  }
  const fundRows = holdings.filter((holding) => /\bETF\b|ISHARES|VANGUARD|\bFUND\b/i.test(holding.name));
  return fundRows.length / holdings.length > 0.6;
}

function parseVanguardCanadaHtml(html) {
  const start = html.search(/Market allocation/i);
  if (start < 0) {
    return null;
  }
  const rest = html.slice(start + 20);
  const nextHeading = rest.search(/<h[1-6]\b/i);
  const slice = html.slice(start, nextHeading >= 0 ? start + 20 + nextHeading : start + 15000);
  const totals = {};
  const pattern = /<th[^>]*scope="row"[^>]*>\s*([^<]+?)\s*<\/th>\s*<td[^>]*>[\s\S]*?<\/td>\s*(?:<!---->\s*)?<td[^>]*class="numeric"[^>]*>\s*([0-9.]+)\s*%/gi;
  let match = pattern.exec(slice);
  while (match) {
    const country = normalizeCountry(match[1]);
    const weight = Number(match[2]);
    if (country && Number.isFinite(weight) && weight > 0) {
      totals[country] = (totals[country] || 0) + weight;
    }
    match = pattern.exec(slice);
  }
  return toFractions(totals);
}

function vanguardCanadaTicker(html) {
  const match = html.match(/data-search-id="ric">([A-Z0-9.]+)/i);
  if (!match) {
    return null;
  }
  return normalizeSymbol(match[1]).replace(/\.TO$/, '');
}

function parseVanguardUsProfile(html) {
  const marker = 'data-vgn-funds-profile="';
  const start = html.indexOf(marker);
  if (start < 0) {
    return null;
  }
  const end = html.indexOf('" id=', start);
  if (end < 0) {
    return null;
  }
  const encoded = html.slice(start + marker.length, end);
  let data;
  try {
    data = JSON.parse(encoded.replace(/&#34;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  } catch (error) {
    return null;
  }
  const markets = data.portfolioComposition?.weightedExposures?.markets;
  if (markets?.isavailable && Array.isArray(markets.exposure)) {
    const totals = {};
    for (const row of markets.exposure) {
      const country = normalizeCountry(row.name);
      const weight = parsePercent(row.value);
      if (country && weight > 0) {
        totals[country] = (totals[country] || 0) + weight;
      }
    }
    const fractions = toFractions(totals);
    if (fractions) {
      return fractions;
    }
  }
  const assetClass = data.overview?.assetClass || '';
  if (/domestic stock/i.test(assetClass)) {
    return { 'United States': 1 };
  }
  if (/bond/i.test(assetClass) && /domestic|u\.s\.|us /i.test(assetClass)) {
    return { 'United States': 1 };
  }
  return null;
}

function parseGeographicSection(html, heading) {
  const start = html.search(new RegExp(heading, 'i'));
  if (start < 0) {
    return null;
  }
  const slice = html.slice(start, start + 8000);
  const totals = {};
  const pattern = />([A-Za-z][A-Za-z .'-]{2,40})</g;
  let match = pattern.exec(slice);
  while (match) {
    const country = normalizeCountry(match[1]);
    if (!country || /^(category|weight|fund|benchmark|type|as at)$/i.test(country)) {
      match = pattern.exec(slice);
      continue;
    }
    const after = slice.slice(match.index, match.index + 200);
    const percent = after.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (percent) {
      const weight = Number(percent[1]);
      if (weight > 0 && weight <= 100) {
        totals[country] = (totals[country] || 0) + weight;
      }
    }
    match = pattern.exec(slice);
  }
  return toFractions(totals);
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const runners = [];
  const count = Math.min(limit, items.length);
  for (let i = 0; i < count; i += 1) {
    runners.push(run());
  }
  await Promise.all(runners);
  return results;
}

async function isharesCatalog(catalog) {
  const storageKey = `isharesCatalog:${catalog.key}`;
  const stored = await storageGet([storageKey]);
  const cached = stored[storageKey];
  if (cached && Date.now() - cached.at < CATALOG_CACHE_MS) {
    return cached.byTicker;
  }
  const data = await fetchJson(catalog.catalogUrl, 45000);
  const byTicker = {};
  for (const item of Object.values(data)) {
    const ticker = normalizeSymbol(item.localExchangeTicker);
    if (!ticker || !item.productPageUrl) {
      continue;
    }
    byTicker[ticker] = { page: item.productPageUrl, origin: catalog.origin };
  }
  await storageSet({ [storageKey]: { at: Date.now(), byTicker } });
  return byTicker;
}

function baseFundTicker(symbol) {
  return normalizeSymbol(symbol).replace(/\.(F|U)$/, '');
}

function oneCountryWeights(symbol) {
  const country = ONE_COUNTRY_FUNDS[baseFundTicker(symbol)];
  if (!country) {
    return null;
  }
  return { [country]: 1 };
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function weightsFromHoldingsCsv(text) {
  const lines = String(text || '').split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith('Ticker,Name,'));
  if (headerIndex < 0) {
    return null;
  }
  const header = parseCsvLine(lines[headerIndex]);
  const weightIndex = header.indexOf('Weight (%)');
  const locationIndex = header.indexOf('Location');
  if (weightIndex < 0 || locationIndex < 0) {
    return null;
  }
  const totals = {};
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) {
      continue;
    }
    const cells = parseCsvLine(line);
    const country = normalizeCountry(cells[locationIndex]);
    const weight = Number(String(cells[weightIndex] || '').replace(/,/g, ''));
    if (!country || !(weight > 0)) {
      continue;
    }
    totals[country] = (totals[country] || 0) + weight;
  }
  return toFractions(totals);
}

async function isharesCsvWeights(pageUrl) {
  const csvUrl = `${pageUrl.replace(/\/$/, '')}/latest-holdings.csv`;
  const csv = await fetchText(csvUrl, 25000);
  return weightsFromHoldingsCsv(csv);
}

async function isharesHoldingRows(pageUrl) {
  const html = await fetchText(pageUrl, 25000);
  const links = html.match(/[^"'\\\s]+1464253357814\.ajax\?[^"'\\\s]+/g) || [];
  const absolute = links.map((link) => link.startsWith('http') ? link : new URL(link, pageUrl).href);
  const lookthrough = absolute.find((link) => /tab=lookthrus/.test(link) && /fileType=json/.test(link));
  const allHoldings = absolute.find((link) => /tab=all/.test(link) && /fileType=json/.test(link));
  const chosen = lookthrough || allHoldings;
  if (!chosen) {
    return null;
  }
  const payload = await fetchJson(chosen, 45000);
  return payload.aaData || null;
}

async function isharesWeights(symbol, depth) {
  const ticker = normalizeSymbol(symbol);
  for (const catalog of ISHARES_CATALOGS) {
    let byTicker;
    try {
      byTicker = await isharesCatalog(catalog);
    } catch (error) {
      continue;
    }
    const entry = byTicker[ticker];
    if (!entry) {
      continue;
    }
    const pageUrl = entry.page.startsWith('http') ? entry.page : `${entry.origin}${entry.page}`;
    if (pageUrl.includes('://www.ishares.com/')) {
      try {
        const csvWeights = await isharesCsvWeights(pageUrl);
        if (csvWeights) {
          return csvWeights;
        }
      } catch (error) {
        // The holdings spreadsheet is missing; try the page's holdings link.
      }
    }
    let rows;
    try {
      rows = await isharesHoldingRows(pageUrl);
    } catch (error) {
      continue;
    }
    if (!rows || rows.length === 0) {
      continue;
    }
    if (depth < 1 && rowsLookLikeFunds(rows)) {
      const totals = {};
      for (const row of rows) {
        const holding = blackrockHolding(row);
        if (!holding) {
          continue;
        }
        const underlying = normalizeSymbol(holding.ticker);
        if (!underlying || !(holding.weight > 0)) {
          continue;
        }
        const nested = await countryWeightsForSymbol({
          symbol: underlying,
          name: holding.name,
          exchange: '',
          mic: '',
          fund: true,
          depth: depth + 1,
        });
        if (!nested) {
          return null;
        }
        for (const [country, fraction] of Object.entries(nested)) {
          totals[country] = (totals[country] || 0) + holding.weight * fraction;
        }
      }
      return toFractions(totals);
    }
    return weightsFromBlackrockRows(rows);
  }
  return null;
}

async function vanguardCanadaMap() {
  const stored = await storageGet(['vanguardCaMap']);
  const cached = stored.vanguardCaMap;
  if (cached && Date.now() - cached.at < CATALOG_CACHE_MS) {
    return cached.byTicker;
  }
  const sitemap = await fetchText('https://www.vanguard.ca/en/sitemap.xml', 20000);
  const urls = [...sitemap.matchAll(/<loc>([^<]*\/en\/product\/etf\/[^<]+)<\/loc>/g)].map((match) => match[1]);
  const byTicker = {};
  await mapPool(urls, 4, async (url) => {
    try {
      const html = await fetchText(url, 20000);
      const ticker = vanguardCanadaTicker(html);
      const weights = parseVanguardCanadaHtml(html);
      if (ticker && weights) {
        byTicker[ticker] = weights;
      }
    } catch (error) {
      // One product page failing should not drop the rest of the map.
    }
  });
  await storageSet({ vanguardCaMap: { at: Date.now(), byTicker } });
  return byTicker;
}

async function vanguardWeights(symbol, exchange, mic) {
  const ticker = normalizeSymbol(symbol);
  if (isUsListing(exchange, mic)) {
    try {
      const html = await fetchText(`https://investor.vanguard.com/investment-products/etfs/profile/${ticker.toLowerCase()}`, 20000);
      const weights = parseVanguardUsProfile(html);
      if (weights) {
        return weights;
      }
    } catch (error) {
      return null;
    }
    return null;
  }
  try {
    const byTicker = await vanguardCanadaMap();
    if (byTicker[ticker]) {
      return byTicker[ticker];
    }
  } catch (error) {
    // Fall through to the US profile for a fund that is listed there.
  }
  try {
    const html = await fetchText(`https://investor.vanguard.com/investment-products/etfs/profile/${ticker.toLowerCase()}`, 20000);
    return parseVanguardUsProfile(html);
  } catch (error) {
    return null;
  }
}

async function globalxWeights(symbol) {
  const ticker = normalizeSymbol(symbol);
  const slugs = [...new Set([
    ticker.toLowerCase(),
    ticker.toLowerCase().replace(/\./g, '-'),
    ticker.toLowerCase().replace(/\./g, ''),
  ])];
  for (const slug of slugs) {
    try {
      const html = await fetchText(`https://www.globalx.ca/product/${slug}`, 20000);
      const weights = parseGeographicSection(html, 'Top Geographic Exposure')
        || parseGeographicSection(html, 'Geographic Exposure');
      if (weights) {
        return weights;
      }
    } catch (error) {
      // Try the next slug.
    }
  }
  return null;
}

async function bmoWeights() {
  // bmogam.com redirects these ticker URLs and does not allow an extension fetch.
  return null;
}

let yahooCrumbPromise = null;

async function yahooCrumb() {
  if (!yahooCrumbPromise) {
    yahooCrumbPromise = (async () => {
      await fetch('https://fc.yahoo.com', {
        credentials: 'include',
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      const response = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        credentials: 'include',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error('Yahoo crumb request failed');
      }
      return response.text();
    })().catch((error) => {
      yahooCrumbPromise = null;
      throw error;
    });
  }
  return yahooCrumbPromise;
}

async function stockCountry(symbol, exchange, mic) {
  const crumb = await yahooCrumb();
  const yahoo = yahooSymbol(symbol, exchange, mic);
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahoo)}?modules=assetProfile&crumb=${encodeURIComponent(crumb.trim())}`;
  const payload = await fetchJson(url, 20000);
  const country = payload.quoteSummary?.result?.[0]?.assetProfile?.country;
  const normalized = normalizeCountry(country);
  if (!normalized) {
    return null;
  }
  return { [normalized]: 1 };
}

async function countryWeightsForSymbol({ symbol, name, exchange, mic, fund, depth }) {
  const ticker = normalizeSymbol(symbol);
  const cacheKey = `${fund ? 'fund' : 'stock'}:${ticker}:${normalizeSymbol(exchange)}:${depth || 0}`;
  if ((depth || 0) === 0) {
    const cached = await readCache(cacheKey);
    if (cached) {
      return cached;
    }
  }

  let weights = null;
  if (fund) {
    weights = oneCountryWeights(ticker);
    const proxy = INDEX_PROXIES[baseFundTicker(ticker)];
    if (!weights && proxy && (depth || 0) < 1) {
      try {
        weights = await isharesWeights(proxy, (depth || 0) + 1);
      } catch (error) {
        weights = null;
      }
    }
    if (!weights) {
      const issuer = issuerOf(name, ticker);
      const attempts = [];
      if (issuer === 'ishares' || !issuer) attempts.push(() => isharesWeights(ticker, depth || 0));
      if (issuer === 'vanguard' || !issuer) attempts.push(() => vanguardWeights(ticker, exchange, mic));
      if (issuer === 'globalx' || !issuer) attempts.push(() => globalxWeights(ticker));
      if (issuer === 'bmo' || !issuer) attempts.push(() => bmoWeights(ticker));
      for (const attempt of attempts) {
        try {
          weights = await attempt();
        } catch (error) {
          weights = null;
        }
        if (weights) {
          break;
        }
      }
    }
  } else {
    try {
      weights = await stockCountry(ticker, exchange, mic);
    } catch (error) {
      weights = null;
    }
  }

  if ((depth || 0) === 0 && weights) {
    await writeCache(cacheKey, weights);
  }
  return weights;
}

function addCountryValue(totals, value, weights) {
  for (const [country, fraction] of Object.entries(weights)) {
    totals[country] = (totals[country] || 0) + value * fraction;
  }
}

function rollupCountries(totals, unknownValue) {
  const entries = Object.entries(totals).filter(([, value]) => value > 0);
  const knownSum = entries.reduce((sum, [, value]) => sum + value, 0);
  const total = knownSum + (unknownValue > 0 ? unknownValue : 0);
  const other = { value: 0 };
  const kept = [];
  for (const [country, value] of entries) {
    if (country === 'Other') {
      other.value += value;
      continue;
    }
    if (total > 0 && value / total < 0.01) {
      other.value += value;
    } else {
      kept.push([country, value]);
    }
  }
  kept.sort((a, b) => b[1] - a[1]);
  if (other.value > 0) {
    kept.push(['Other', other.value]);
  }
  if (unknownValue > 0) {
    kept.push(['Unknown', unknownValue]);
  }
  return kept.map(([label, value]) => ({
    label,
    value,
    percent: total > 0 ? (value / total) * 100 : 0,
  }));
}

async function buildAllocation(positions, accounts) {
  const assetTotals = { Cash: 0, Bonds: 0, Stocks: 0, Crypto: 0, Other: 0 };
  const countryTotals = {};
  let unknownValue = 0;
  const unknownSymbols = [];
  const excluded = [];

  const coveredAccounts = new Set();
  const otherHoldings = [];
  let sawAccountId = false;
  for (const position of positions) {
    for (const account of position.accounts || []) {
      if (account.id) {
        sawAccountId = true;
        coveredAccounts.add(account.id);
      }
    }
  }

  const addOther = (label, value) => {
    const existing = otherHoldings.find((holding) => holding.label === label);
    if (existing) {
      existing.value += value;
      return;
    }
    otherHoldings.push({ label, value });
  };

  const lookups = [];
  for (const position of positions) {
    const value = positionValue(position);
    if (!(value > 0)) {
      continue;
    }
    const security = position.security || {};
    const stock = security.stock || {};
    const symbol = stock.symbol || security.id || 'Unknown';
    const name = stock.name || '';
    const asset = classifyAsset(position);
    assetTotals[asset] = (assetTotals[asset] || 0) + value;
    if (asset === 'Other') {
      addOther(holdingLabel(position), value);
    }

    if (asset === 'Cash') {
      excluded.push(symbol);
      continue;
    }
    if (asset === 'Crypto') {
      excluded.push(symbol);
      continue;
    }
    if (isGold(symbol, name) || /^(gold|metals)$/i.test(String(security.assetClass || ''))) {
      excluded.push(symbol);
      continue;
    }

    lookups.push({
      value,
      symbol,
      name,
      exchange: stock.primaryExchange || '',
      mic: stock.primaryMic || '',
      fund: isFund(position) || asset === 'Bonds',
    });
  }

  await mapPool(lookups, 3, async (lookup) => {
    const weights = await countryWeightsForSymbol({
      symbol: lookup.symbol,
      name: lookup.name,
      exchange: lookup.exchange,
      mic: lookup.mic,
      fund: lookup.fund,
      depth: 0,
    });
    if (!weights) {
      unknownValue += lookup.value;
      unknownSymbols.push(lookup.symbol);
      return;
    }
    addCountryValue(countryTotals, lookup.value, weights);
  });

  if (sawAccountId || positions.length === 0) {
    for (const account of accounts) {
      if (coveredAccounts.has(account.id)) {
        continue;
      }
      if (account.unifiedAccountType === 'CREDIT_CARD') {
        continue;
      }
      const value = accountLiquidationValue(account);
      if (!(value > 0)) {
        continue;
      }
      const label = account.description || account.unifiedAccountType || account.id;
      if (account.unifiedAccountType === 'CASH') {
        assetTotals.Cash += value;
        excluded.push(label);
      } else if (account.unifiedAccountType === 'SELF_DIRECTED_CRYPTO') {
        assetTotals.Crypto += value;
        excluded.push(label);
      } else {
        assetTotals.Other += value;
        addOther(label, value);
        unknownValue += value;
        unknownSymbols.push(label);
      }
    }
  }

  const assetSlices = ['Cash', 'Bonds', 'Stocks', 'Crypto', 'Other']
    .filter((label) => assetTotals[label] > 0)
    .map((label) => ({ label, value: assetTotals[label] }));
  const assetSum = assetSlices.reduce((sum, slice) => sum + slice.value, 0);
  for (const slice of assetSlices) {
    slice.percent = assetSum > 0 ? (slice.value / assetSum) * 100 : 0;
  }
  for (const holding of otherHoldings) {
    holding.percent = assetSum > 0 ? (holding.value / assetSum) * 100 : 0;
  }
  otherHoldings.sort((a, b) => b.value - a.value);

  return {
    assets: assetSlices,
    otherHoldings,
    countries: rollupCountries(countryTotals, unknownValue),
    unknownSymbols: [...new Set(unknownSymbols)],
    excluded: [...new Set(excluded)],
  };
}

globalThis.CountryExposure = {
  normalizeCountry,
  normalizeSymbol,
  classifyAsset,
  isFund,
  isGold,
  weightsFromBlackrockRows,
  parseVanguardCanadaHtml,
  parseVanguardUsProfile,
  parseGeographicSection,
  vanguardCanadaTicker,
  rowsLookLikeFunds,
  buildAllocation,
  positionValue,
};
