// Wealthsimple API JavaScript Client
// Converted from Python wealthsimple_api.py

// Exception classes
class WSApiException extends Error {
  constructor(message, response = null) {
    super(message);
    this.name = 'WSApiException';
    this.response = response;
  }
}

class CurlException extends WSApiException {
  constructor(message) {
    super(message);
    this.name = 'CurlException';
  }
}

class LoginFailedException extends WSApiException {
  constructor(message, response = null) {
    super(message, response);
    this.name = 'LoginFailedException';
  }
}

class ManualLoginRequired extends WSApiException {
  constructor(message) {
    super(message);
    this.name = 'ManualLoginRequired';
  }
}

class OTPRequiredException extends WSApiException {
  constructor(message) {
    super(message);
    this.name = 'OTPRequiredException';
  }
}

class UnexpectedException extends WSApiException {
  constructor(message) {
    super(message);
    this.name = 'UnexpectedException';
  }
}

// Base API class
class WealthsimpleAPIBase {
  static OAUTH_BASE_URL = 'https://api.production.wealthsimple.com/v1/oauth/v2';
  static GRAPHQL_URL = 'https://my.wealthsimple.com/graphql';
  static GRAPHQL_VERSION = '12';
  static user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

  static GRAPHQL_QUERIES = {
    'FetchAllAccountFinancials': "query FetchAllAccountFinancials($identityId: ID!, $startDate: Date, $pageSize: Int = 25, $cursor: String) {\n  identity(id: $identityId) {\n    id\n    ...AllAccountFinancials\n    __typename\n  }\n}\n\nfragment AllAccountFinancials on Identity {\n  accounts(filter: {}, first: $pageSize, after: $cursor) {\n    pageInfo {\n      hasNextPage\n      endCursor\n      __typename\n    }\n    edges {\n      cursor\n      node {\n        ...AccountWithFinancials\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment AccountWithFinancials on Account {\n  ...AccountWithLink\n  ...AccountFinancials\n  __typename\n}\n\nfragment AccountWithLink on Account {\n  ...Account\n  linkedAccount {\n    ...Account\n    __typename\n  }\n  __typename\n}\n\nfragment Account on Account {\n  ...AccountCore\n  custodianAccounts {\n    ...CustodianAccount\n    __typename\n  }\n  __typename\n}\n\nfragment AccountCore on Account {\n  id\n  archivedAt\n  branch\n  closedAt\n  createdAt\n  cacheExpiredAt\n  currency\n  requiredIdentityVerification\n  unifiedAccountType\n  supportedCurrencies\n  nickname\n  status\n  accountOwnerConfiguration\n  accountFeatures {\n    ...AccountFeature\n    __typename\n  }\n  accountOwners {\n    ...AccountOwner\n    __typename\n  }\n  type\n  __typename\n}\n\nfragment AccountFeature on AccountFeature {\n  name\n  enabled\n  __typename\n}\n\nfragment AccountOwner on AccountOwner {\n  accountId\n  identityId\n  accountNickname\n  clientCanonicalId\n  accountOpeningAgreementsSigned\n  name\n  email\n  ownershipType\n  activeInvitation {\n    ...AccountOwnerInvitation\n    __typename\n  }\n  sentInvitations {\n    ...AccountOwnerInvitation\n    __typename\n  }\n  __typename\n}\n\nfragment AccountOwnerInvitation on AccountOwnerInvitation {\n  id\n  createdAt\n  inviteeName\n  inviteeEmail\n  inviterName\n  inviterEmail\n  updatedAt\n  sentAt\n  status\n  __typename\n}\n\nfragment CustodianAccount on CustodianAccount {\n  id\n  branch\n  custodian\n  status\n  updatedAt\n  __typename\n}\n\nfragment AccountFinancials on Account {\n  id\n  custodianAccounts {\n    id\n    branch\n    financials {\n      current {\n        ...CustodianAccountCurrentFinancialValues\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  financials {\n    currentCombined {\n      id\n      ...AccountCurrentFinancials\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment CustodianAccountCurrentFinancialValues on CustodianAccountCurrentFinancialValues {\n  deposits {\n    ...Money\n    __typename\n  }\n  earnings {\n    ...Money\n    __typename\n  }\n  netDeposits {\n    ...Money\n    __typename\n  }\n  netLiquidationValue {\n    ...Money\n    __typename\n  }\n  withdrawals {\n    ...Money\n    __typename\n  }\n  __typename\n}\n\nfragment Money on Money {\n  amount\n  cents\n  currency\n  __typename\n}\n\nfragment AccountCurrentFinancials on AccountCurrentFinancials {\n  id\n  netLiquidationValue {\n    ...Money\n    __typename\n  }\n  netDeposits {\n    ...Money\n    __typename\n  }\n  simpleReturns(referenceDate: $startDate) {\n    ...SimpleReturns\n    __typename\n  }\n  totalDeposits {\n    ...Money\n    __typename\n  }\n  totalWithdrawals {\n    ...Money\n    __typename\n  }\n  __typename\n}\n\nfragment SimpleReturns on SimpleReturns {\n  amount {\n    ...Money\n    __typename\n  }\n  asOf\n  rate\n  referenceDate\n  __typename\n}",
    'FetchActivityFeedItems': "query FetchActivityFeedItems($first: Int, $cursor: Cursor, $condition: ActivityCondition, $orderBy: [ActivitiesOrderBy!] = OCCURRED_AT_DESC) {\n  activityFeedItems(\n    first: $first\n    after: $cursor\n    condition: $condition\n    orderBy: $orderBy\n  ) {\n    edges {\n      node {\n        ...Activity\n        __typename\n      }\n      __typename\n    }\n    pageInfo {\n      hasNextPage\n      endCursor\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment Activity on ActivityFeedItem {\n  accountId\n  aftOriginatorName\n  aftTransactionCategory\n  aftTransactionType\n  amount\n  amountSign\n  assetQuantity\n  assetSymbol\n  canonicalId\n  currency\n  eTransferEmail\n  eTransferName\n  externalCanonicalId\n  identityId\n  institutionName\n  occurredAt\n  p2pHandle\n  p2pMessage\n  spendMerchant\n  securityId\n  billPayCompanyName\n  billPayPayeeNickname\n  redactedExternalAccountNumber\n  opposingAccountId\n  status\n  subType\n  type\n  strikePrice\n  contractType\n  expiryDate\n  chequeNumber\n  provisionalCreditAmount\n  primaryBlocker\n  interestRate\n  frequency\n  counterAssetSymbol\n  rewardProgram\n  counterPartyCurrency\n  counterPartyCurrencyAmount\n  counterPartyName\n  fxRate\n  fees\n  reference\n  __typename\n}",
    'FetchSecuritySearchResult': "query FetchSecuritySearchResult($query: String!) {\n  securitySearch(input: {query: $query}) {\n    results {\n      ...SecuritySearchResult\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment SecuritySearchResult on Security {\n  id\n  buyable\n  status\n  stock {\n    symbol\n    name\n    primaryExchange\n    __typename\n  }\n  securityGroups {\n    id\n    name\n    __typename\n  }\n  quoteV2 {\n    ... on EquityQuote {\n      marketStatus\n      __typename\n    }\n    __typename\n  }\n  __typename\n}",
    'FetchSecurityHistoricalQuotes': "query FetchSecurityHistoricalQuotes($id: ID!, $timerange: String! = \"1d\") {\n  security(id: $id) {\n    id\n    historicalQuotes(timeRange: $timerange) {\n      ...HistoricalQuote\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment HistoricalQuote on HistoricalQuote {\n  adjustedPrice\n  currency\n  date\n  securityId\n  time\n  __typename\n}",
    'FetchAccountsWithBalance': "query FetchAccountsWithBalance($ids: [String!]!, $type: BalanceType!) {\n  accounts(ids: $ids) {\n    ...AccountWithBalance\n    __typename\n  }\n}\n\nfragment AccountWithBalance on Account {\n  id\n  custodianAccounts {\n    id\n    financials {\n      ... on CustodianAccountFinancialsSo {\n        balance(type: $type) {\n          ...Balance\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n  __typename\n}\n\nfragment Balance on Balance {\n  quantity\n  securityId\n  __typename\n}",
    'FetchSecurityMarketData': "query FetchSecurityMarketData($id: ID!) {\n  security(id: $id) {\n    id\n    ...SecurityMarketData\n    __typename\n  }\n}\n\nfragment SecurityMarketData on Security {\n  id\n  allowedOrderSubtypes\n  marginRates {\n    ...MarginRates\n    __typename\n  }\n  fundamentals {\n    avgVolume\n    high52Week\n    low52Week\n    yield\n    peRatio\n    marketCap\n    currency\n    description\n    __typename\n  }\n  quote {\n    bid\n    ask\n    open\n    high\n    low\n    volume\n    askSize\n    bidSize\n    last\n    lastSize\n    quotedAsOf\n    quoteDate\n    amount\n    previousClose\n    __typename\n  }\n  stock {\n    primaryExchange\n    primaryMic\n    name\n    symbol\n    __typename\n  }\n  __typename\n}\n\nfragment MarginRates on MarginRates {\n  clientMarginRate\n  __typename\n}",
    'FetchFundsTransfer': "query FetchFundsTransfer($id: ID!) {\n  fundsTransfer: funds_transfer(id: $id, include_cancelled: true) {\n    ...FundsTransfer\n    __typename\n  }\n}\n\nfragment FundsTransfer on FundsTransfer {\n  id\n  status\n  cancellable\n  rejectReason: reject_reason\n  schedule {\n    id\n    __typename\n  }\n  source {\n    ...BankAccountOwner\n    __typename\n  }\n  destination {\n    ...BankAccountOwner\n    __typename\n  }\n  __typename\n}\n\nfragment BankAccountOwner on BankAccountOwner {\n  bankAccount: bank_account {\n    ...BankAccount\n    __typename\n  }\n  __typename\n}\n\nfragment BankAccount on BankAccount {\n  id\n  accountName: account_name\n  corporate\n  createdAt: created_at\n  currency\n  institutionName: institution_name\n  jurisdiction\n  nickname\n  type\n  updatedAt: updated_at\n  verificationDocuments: verification_documents {\n    ...BankVerificationDocument\n    __typename\n  }\n  verifications {\n    ...BankAccountVerification\n    __typename\n  }\n  ...CaBankAccount\n  ...UsBankAccount\n  __typename\n}\n\nfragment CaBankAccount on CaBankAccount {\n  accountName: account_name\n  accountNumber: account_number\n  __typename\n}\n\nfragment UsBankAccount on UsBankAccount {\n  accountName: account_name\n  accountNumber: account_number\n  __typename\n}\n\nfragment BankVerificationDocument on VerificationDocument {\n  id\n  acceptable\n  updatedAt: updated_at\n  createdAt: created_at\n  documentId: document_id\n  documentType: document_type\n  rejectReason: reject_reason\n  reviewedAt: reviewed_at\n  reviewedBy: reviewed_by\n  __typename\n}\n\nfragment BankAccountVerification on BankAccountVerification {\n  custodianProcessedAt: custodian_processed_at\n  custodianStatus: custodian_status\n  document {\n    ...BankVerificationDocument\n    __typename\n  }\n  __typename\n}",
    'FetchInstitutionalTransfer': "query FetchInstitutionalTransfer($id: ID!) {\n  accountTransfer(id: $id) {\n    ...InstitutionalTransfer\n    __typename\n  }\n}\n\nfragment InstitutionalTransfer on InstitutionalTransfer {\n  id\n  accountId: account_id\n  state\n  documentId: document_id\n  documentType: document_type\n  expectedCompletionDate: expected_completion_date\n  timelineExpectation: timeline_expectation {\n    lowerBound: lower_bound\n    upperBound: upper_bound\n    __typename\n  }\n  estimatedCompletionMaximum: estimated_completion_maximum\n  estimatedCompletionMinimum: estimated_completion_minimum\n  institutionName: institution_name\n  transferStatus: external_state\n  redactedInstitutionAccountNumber: redacted_institution_account_number\n  expectedValue: expected_value\n  transferType: transfer_type\n  cancellable\n  pdfUrl: pdf_url\n  clientVisibleState: client_visible_state\n  shortStatusDescription: short_status_description\n  longStatusDescription: long_status_description\n  progressPercentage: progress_percentage\n  type\n  rolloverType: rollover_type\n  autoSignatureEligible: auto_signature_eligible\n  parentInstitution: parent_institution {\n    id\n    name\n    __typename\n  }\n  stateHistories: state_histories {\n    id\n    state\n    notes\n    transitionSubmittedBy: transition_submitted_by\n    transitionedAt: transitioned_at\n    transitionCode: transition_code\n    __typename\n  }\n  transferFeeReimbursement: transfer_fee_reimbursement {\n    id\n    feeAmount: fee_amount\n    __typename\n  }\n  docusignSentViaEmail: docusign_sent_via_email\n  clientAccountType: client_account_type\n  primaryClientIdentityId: primary_client_identity_id\n  primaryOwnerSigned: primary_owner_signed\n  secondaryOwnerSigned: secondary_owner_signed\n  __typename\n}",
    'FetchAccountHistoricalFinancials': "query FetchAccountHistoricalFinancials($id: ID!, $currency: Currency!, $startDate: Date, $resolution: DateResolution!, $endDate: Date, $first: Int, $cursor: String) {\n          account(id: $id) {\n            id\n            financials {\n              historicalDaily(\n                currency: $currency\n                startDate: $startDate\n                resolution: $resolution\n                endDate: $endDate\n                first: $first\n                after: $cursor\n              ) {\n                edges {\n                  node {\n                    ...AccountHistoricalFinancials\n                    __typename\n                  }\n                  __typename\n                }\n                pageInfo {\n                  hasNextPage\n                  endCursor\n                  __typename\n                }\n                __typename\n              }\n              __typename\n            }\n            __typename\n          }\n        }\n\n        fragment AccountHistoricalFinancials on AccountHistoricalDailyFinancials {\n          date\n          netLiquidationValueV2 {\n            ...Money\n            __typename\n          }\n          netDepositsV2 {\n            ...Money\n            __typename\n          }\n          __typename\n        }\n\n        fragment Money on Money {\n          amount\n          cents\n          currency\n          __typename\n        }",
    'FetchIdentityHistoricalFinancials': "query FetchIdentityHistoricalFinancials($identityId: ID!, $currency: Currency!, $startDate: Date, $endDate: Date, $first: Int, $cursor: String, $accountIds: [ID!]) {\n      identity(id: $identityId) {\n        id\n        financials(filter: {accounts: $accountIds}) {\n          historicalDaily(\n            currency: $currency\n            startDate: $startDate\n            endDate: $endDate\n            first: $first\n            after: $cursor\n          ) {\n            edges {\n              node {\n                ...IdentityHistoricalFinancials\n                __typename\n              }\n              __typename\n            }\n            pageInfo {\n              hasNextPage\n              endCursor\n              __typename\n            }\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n    }\n\n    fragment IdentityHistoricalFinancials on IdentityHistoricalDailyFinancials {\n      date\n      netLiquidationValueV2 {\n        amount\n        currency\n        __typename\n      }\n      netDepositsV2 {\n        amount\n        currency\n        __typename\n      }\n      __typename\n    }",
    'FetchCorporateActionChildActivities': "query FetchCorporateActionChildActivities($activityCanonicalId: String!) {\n  corporateActionChildActivities(\n    condition: {activityCanonicalId: $activityCanonicalId}\n  ) {\n    nodes {\n      ...CorporateActionChildActivity\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment CorporateActionChildActivity on CorporateActionChildActivity {\n  canonicalId\n  activityCanonicalId\n  assetName\n  assetSymbol\n  assetType\n  entitlementType\n  quantity\n  currency\n  price\n  recordDate\n  __typename\n}",
    'FetchBrokerageMonthlyStatementTransactions': "query FetchBrokerageMonthlyStatementTransactions($period: String!, $accountId: String!) {\n  brokerageMonthlyStatements(period: $period, accountId: $accountId) {\n    id\n    statementType\n    createdAt\n    data {\n      ... on BrokerageMonthlyStatementObject {\n        ...BrokerageMonthlyStatementObject\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n\nfragment BrokerageMonthlyStatementObject on BrokerageMonthlyStatementObject {\n  custodianAccountId\n  activitiesPerCurrency {\n    currency\n    currentTransactions {\n      ...BrokerageMonthlyStatementTransactions\n      __typename\n    }\n    __typename\n  }\n  currentTransactions {\n    ...BrokerageMonthlyStatementTransactions\n    __typename\n  }\n  isMultiCurrency\n  __typename\n}\n\nfragment BrokerageMonthlyStatementTransactions on BrokerageMonthlyStatementTransactions {\n  balance\n  cashMovement\n  unit\n  description\n  transactionDate\n  transactionType\n  __typename\n}",
  };

  constructor(sess = null) {
    this.security_market_data_cache_getter = null;
    this.security_market_data_cache_setter = null;
    this.initialized  = false;
  }

  async get_token_info() {
    // Get all cookies for the Wealthsimple domain
    const cookies = await getCookiesForDomain('wealthsimple.com');

    if (!cookies || cookies.length === 0) {
      throw new Error(
        "No cookies found. Please make sure you are logged in to Wealthsimple."
      );
    }

    // Find the cookie with the name "_oauth2_access_v2" and get the value
    const oauth2Cookie = cookies.find((cookie) => cookie.name === "_oauth2_access_v2");
    if (!oauth2Cookie) {
      throw new Error("OAuth cookie not found. Please make sure you are logged in to Wealthsimple.");
    }
    this.session = JSON.parse(decodeURIComponent(oauth2Cookie.value));
    this.initialized = true;
  }

  static uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async send_http_request(url, method = 'POST', data = null, headers = null, return_headers = false) {

    if (!this.initialized) {
      await this.get_token_info();
    }

    headers = headers || {};
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }
   
    headers['Authorization'] = `Bearer ${this.session.access_token}`;
    

    if (WealthsimpleAPIBase.user_agent) {
      headers['User-Agent'] = WealthsimpleAPIBase.user_agent;
    }

    try {
      const options = {
        method: method,
        headers: headers,
      };

      if (data && method === 'POST') {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);

      if (return_headers) {
        const responseHeaders = Array.from(response.headers.entries())
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n');
        const text = await response.text();
        return `${responseHeaders}\r\n\r\n${text}`;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof WSApiException) {
        throw error;
      }
      throw new CurlException(`HTTP request failed: ${error.message}`);
    }
  }

  async send_get(url, headers = null, return_headers = false) {
    return this.send_http_request(url, 'GET', null, headers, return_headers);
  }

  async send_post(url, data, headers = null, return_headers = false) {
    return this.send_http_request(url, 'POST', data, headers, return_headers);
  }

  async search_security(query) {
    return this.do_graphql_query(
      'FetchSecuritySearchResult',
      { query: query },
      'securitySearch.results',
      'array',
    );
  }

  async do_graphql_query(query_name, variables, data_response_path, expect_type, filter_fn = null, load_all_pages = false) {
    if (!this.initialized) {
      await this.get_token_info();
    }

    const query = {
      operationName: query_name,
      query: WealthsimpleAPIBase.GRAPHQL_QUERIES[query_name],
      variables: variables,
    };

    const headers = {
      "x-ws-profile": "trade",
      "x-ws-api-version": WealthsimpleAPIBase.GRAPHQL_VERSION,
      "x-ws-locale": "en-CA",
      "x-platform-os": "web",
    };

    const response_data = await this.send_post(
      WealthsimpleAPIBase.GRAPHQL_URL,
      query,
      headers
    );

    if (!response_data.data) {
      throw new WSApiException(`GraphQL query failed: ${query_name}`, response_data);
    }

    let data = response_data.data;

    let end_cursor = null;

    // Access the nested data using the data_response_path
    const keys = data_response_path.split('.');
    let last_key = null;
    for (const key of keys) {
      if (!(key in data)) {
        throw new WSApiException(`GraphQL query failed: ${query_name}`, response_data);
      }
      data = data[key];
      last_key = key;
      if (
        typeof data === 'object' &&
        data !== null &&
        !Array.isArray(data) &&
        'pageInfo' in data &&
        typeof data.pageInfo === 'object' &&
        data.pageInfo?.hasNextPage &&
        'endCursor' in data.pageInfo
      ) {
        end_cursor = data.pageInfo.endCursor;
      }
    }

    // Ensure the data type matches the expected one (either array or object)
    if ((expect_type === 'array' && !Array.isArray(data)) ||
        (expect_type === 'object' && (typeof data !== 'object' || data === null || Array.isArray(data)))) {
      throw new WSApiException(`GraphQL query failed: ${query_name}`, response_data);
    }

    if (last_key === 'edges') {
      data = data.map(edge => edge.node);
    }

    if (filter_fn) {
      data = data.filter(filter_fn);
    }

    if (load_all_pages) {
      if (expect_type !== 'array') {
        throw new UnexpectedException("Can't load all pages for GraphQL queries that do not return arrays");
      }
      if (end_cursor) {
        variables.cursor = end_cursor;
        const more_data = await this.do_graphql_query(query_name, variables, data_response_path, expect_type, filter_fn, true);
        if (Array.isArray(data) && Array.isArray(more_data)) {
          data = data.concat(more_data);
        }
      }
    }

    return data;
  }
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


// Main API class
class WealthsimpleAPI extends WealthsimpleAPIBase {
  constructor(sess = null) {
    super(sess);
    this.account_cache = {};
  }

  async get_accounts(open_only = true, use_cache = true) {
    if (!this.initialized) {
      await this.get_token_info();
    }

    const cache_key = open_only ? 'open' : 'all';
    if (!use_cache || !(cache_key in this.account_cache)) {
      const filter_fn = open_only ? (acc) => acc.status === 'open' : null;

      const accounts = await this.do_graphql_query(
        'FetchAllAccountFinancials',
        {
          pageSize: 25,
          identityId: this.session.identity_canonical_id,
        },
        'identity.accounts.edges',
        'array',
        filter_fn,
        true,
      );
      for (const account of accounts) {
        WealthsimpleAPI._account_add_description(account);
      }
      this.account_cache[cache_key] = accounts;
    }
    return this.account_cache[cache_key];
  }

  static _account_add_description(account) {
    account.number = account.id;
    // This is the account number visible in the WS app:
    for (const ca of account.custodianAccounts) {
      if ((ca.branch === 'WS' || ca.branch === 'TR') && ca.status === 'open') {
        account.number = ca.id;
      }
    }

    // Default
    account.description = account.unifiedAccountType;

    if (account.nickname) {
      account.description = account.nickname;
    } else if (account.unifiedAccountType === 'CASH') {
      account.description = account.accountOwnerConfiguration === 'MULTI_OWNER' ? "Cash: joint" : "Cash";
    } else if (account.unifiedAccountType === 'SELF_DIRECTED_RRSP') {
      account.description = `RRSP: self-directed - ${account.currency}`;
    } else if (account.unifiedAccountType === 'MANAGED_RRSP') {
      account.description = `RRSP: managed - ${account.currency}`;
    } else if (account.unifiedAccountType === 'SELF_DIRECTED_SPOUSAL_RRSP') {
      account.description = `RRSP: self-directed spousal - ${account.currency}`;
    } else if (account.unifiedAccountType === 'SELF_DIRECTED_TFSA') {
      account.description = `TFSA: self-directed - ${account.currency}`;
    } else if (account.unifiedAccountType === 'MANAGED_TFSA') {
      account.description = `TFSA: managed - ${account.currency}`;
    } else if (account.unifiedAccountType === 'SELF_DIRECTED_NON_REGISTERED') {
      account.description = "Non-registered: self-directed";
    } else if (account.unifiedAccountType === 'SELF_DIRECTED_JOINT_NON_REGISTERED') {
      account.description = "Non-registered: self-directed - joint";
    } else if (account.unifiedAccountType === 'SELF_DIRECTED_NON_REGISTERED_MARGIN') {
      account.description = "Non-registered: self-directed margin";
    } else if (account.unifiedAccountType === 'MANAGED_JOINT') {
      account.description = "Non-registered: managed - joint";
    } else if (account.unifiedAccountType === 'SELF_DIRECTED_CRYPTO') {
      account.description = "Crypto";
    } else if (account.unifiedAccountType === 'SELF_DIRECTED_RRIF') {
      account.description = `RRIF: self-directed - ${account.currency}`;
    } else if (account.unifiedAccountType === 'CREDIT_CARD') {
      account.description = "Credit card";
    }
    // TODO: Add other types as needed
  }

  async get_account_balances(account_id) {
    const accounts = await this.do_graphql_query(
      'FetchAccountsWithBalance',
      {
        type: 'TRADING',
        ids: [account_id],
      },
      'accounts',
      'array',
    );

    // Extracting balances and returning them in a dictionary
    const balances = {};
    for (const account of accounts[0].custodianAccounts) {
      for (const balance of account.financials.balance) {
        let security = balance.securityId;
        if (security !== 'sec-c-cad' && security !== 'sec-c-usd') {
          security = await this.security_id_to_symbol(security);
        }
        balances[security] = balance.quantity;
      }
    }

    return balances;
  }

  async get_account_historical_financials(account_id, currency = 'CAD', start_date = null, end_date = null, resolution = 'WEEKLY', first = null, cursor = null) {
    return this.do_graphql_query(
      'FetchAccountHistoricalFinancials',
      {
        id: account_id,
        currency: currency,
        startDate: start_date ? this._format_date(start_date) : null,
        endDate: end_date ? this._format_date(end_date) : null,
        resolution: resolution,
        first: first,
        cursor: cursor
      },
      'account.financials.historicalDaily.edges',
      'array',
    );
  }

  async get_identity_historical_financials(account_ids = null, currency = 'CAD', start_date = null, end_date = null, first = null, cursor = null) {
    if (!this.initialized) {
      await this.get_token_info();
    }

    return this.do_graphql_query(
      'FetchIdentityHistoricalFinancials',
      {
        identityId: this.session.identity_canonical_id,
        currency: currency,
        startDate: start_date ? this._format_date(start_date) : null,
        endDate: end_date ? this._format_date(end_date) : null,
        first: first,
        cursor: cursor,
        accountIds: account_ids || [],
      },
      'identity.financials.historicalDaily.edges',
      'array',
    );
  }

  _format_date(date) {
    // Format date to ISO string with microseconds
    if (date instanceof Date) {
      const iso = date.toISOString();
      // Replace milliseconds with microseconds (add 3 zeros)
      return iso.replace(/\.(\d{3})Z$/, '.$1000Z');
    }
    return date;
  }

  async get_activities(
    account_id,
    how_many = 50,
    order_by = 'OCCURRED_AT_DESC',
    ignore_rejected = true,
    start_date = null,
    end_date = null,
    load_all = false
  ) {
    if (typeof account_id === 'string') {
      account_id = [account_id];
    }
    // Calculate the end date for the condition
    if (!end_date) {
      end_date = new Date();
      end_date.setHours(23, 59, 59, 999);
    }

    // Filter function to ignore rejected/cancelled/expired activities
    const filter_fn = (activity) => {
      const act_type = (activity.type || '').toUpperCase();
      const status = (activity.status || '').toLowerCase();
      const excluded_statuses = ['rejected', 'cancelled', 'expired'];
      const is_excluded = excluded_statuses.some(s => status.includes(s));
      return act_type !== 'LEGACY_TRANSFER' && (!ignore_rejected || status === '' || !is_excluded);
    };

    const activities = await this.do_graphql_query(
      'FetchActivityFeedItems',
      {
        orderBy: order_by,
        first: how_many,
        condition: {
          startDate: start_date ? this._format_date(start_date) : null,
          endDate: this._format_date(end_date),
          accountIds: account_id,
        },
      },
      'activityFeedItems.edges',
      'array',
      filter_fn,
      load_all,
    );

    if (!Array.isArray(activities)) {
      throw new WSApiException(`Unexpected response format: ${this.get_activities.name}`, activities);
    }
    for (const act of activities) {
      await this._activity_add_description(act);
    }

    return activities;
  }

  async _activity_add_description(act) {
    act.description = `${act.type}: ${act.subType}`;

    if (act.type === 'INTERNAL_TRANSFER') {
      const accounts = await this.get_accounts(false);
      const matching = accounts.filter(acc => acc.id === act.opposingAccountId);
      const target_account = matching.length > 0 ? matching[0] : null;
      const account_description = target_account
        ? `${target_account.description} (${target_account.number})`
        : act.opposingAccountId;
      if (act.subType === 'SOURCE') {
        act.description = `Transfer out: Transfer to Wealthsimple ${account_description}`;
      } else {
        act.description = `Transfer in: Transfer from Wealthsimple ${account_description}`;
      }
    } else if (act.type === 'DIY_BUY' || act.type === 'DIY_SELL') {
      const verb = act.subType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const action = act.type === 'DIY_BUY' ? 'buy' : 'sell';
      const security = await this.security_id_to_symbol(act.securityId);
      if (act.assetQuantity === null) {
        act.description = `${verb}: ${action} TBD`;
      } else {
        act.description = `${verb}: ${action} ${parseFloat(act.assetQuantity)} x ${security} @ ${parseFloat(act.amount) / parseFloat(act.assetQuantity)}`;
      }
    } else if (act.type === 'CORPORATE_ACTION' && act.subType === 'SUBDIVISION') {
      const child_activities = await this.get_corporate_action_child_activities(act.canonicalId);
      const held_activity = child_activities.find(activity => activity.entitlementType === 'HOLD');
      const receive_activity = child_activities.find(activity => activity.entitlementType === 'RECEIVE');
      if (held_activity && receive_activity) {
        const held_shares = parseFloat(held_activity.quantity);
        const received_shares = parseFloat(receive_activity.quantity);
        const total_shares = held_shares + received_shares;
        act.description = `Subdivision: ${held_shares} -> ${total_shares} shares of ${act.assetSymbol}`;
      } else {
        const received_shares = parseFloat(act.amount);
        act.description = `Subdivision: Received ${received_shares} new shares of ${act.assetSymbol}`;
      }

      if (act.currency === null) {
        const security = await this.get_security_market_data(act.securityId);
        if (security && typeof security === 'object') {
          const fundamentals = security.fundamentals;
          if (fundamentals && typeof fundamentals === 'object') {
            act.currency = fundamentals.currency;
          }
        }
      }
    } else if ((act.type === 'DEPOSIT' || act.type === 'WITHDRAWAL') && (act.subType === 'E_TRANSFER' || act.subType === 'E_TRANSFER_FUNDING')) {
      const direction = act.type === 'DEPOSIT' ? 'from' : 'to';
      act.description = `Deposit: Interac e-transfer ${direction} ${act.eTransferName} ${act.eTransferEmail}`;
    } else if (act.type === 'DEPOSIT' && act.subType === 'PAYMENT_CARD_TRANSACTION') {
      const type_ = act.type.charAt(0).toUpperCase() + act.type.slice(1).toLowerCase();
      act.description = `${type_}: Debit card funding`;
    } else if (act.subType === 'EFT') {
      const details = await this.get_etf_details(act.externalCanonicalId);
      const type_ = act.type.charAt(0).toUpperCase() + act.type.slice(1).toLowerCase();
      const direction = act.type === 'DEPOSIT' ? 'from' : 'to';
      const prop = act.type === 'DEPOSIT' ? 'source' : 'destination';
      let bank_account_info = {};
      if (details && typeof details === 'object') {
        bank_account_info = details[prop] || {};
      }
      let bank_account = {};
      if (bank_account_info && typeof bank_account_info === 'object') {
        bank_account = bank_account_info.bankAccount || {};
      }
      let nickname = bank_account.nickname;
      if (!nickname) {
        nickname = bank_account.accountName;
      }
      act.description = `${type_}: EFT ${direction} ${nickname} ${bank_account.accountNumber}`;
    } else if (act.type === 'REFUND' && act.subType === 'TRANSFER_FEE_REFUND') {
      act.description = "Reimbursement: account transfer fee";
    } else if (act.type === 'INSTITUTIONAL_TRANSFER_INTENT' && act.subType === 'TRANSFER_IN') {
      const details = await this.get_transfer_details(act.externalCanonicalId);
      let verb = '';
      let client_account_type = '';
      let institution_name = '';
      let redacted_account_number = '';
      if (details && typeof details === 'object') {
        verb = details.transferType.replace(/_/g, '-').replace(/\b\w/g, l => l.toUpperCase());
        client_account_type = details.clientAccountType.toUpperCase();
        institution_name = details.institutionName;
        redacted_account_number = details.redactedInstitutionAccountNumber;
      }
      act.description = `Institutional transfer: ${verb} ${client_account_type} account transfer from ${institution_name} ****${redacted_account_number}`;
    } else if (act.type === 'INSTITUTIONAL_TRANSFER_INTENT' && act.subType === 'TRANSFER_OUT') {
      act.description = `Institutional transfer: transfer to ${act.institutionName}`;
    } else if (act.type === 'INTEREST') {
      if (act.subType === 'FPL_INTEREST') {
        act.description = "Stock Lending Earnings";
      } else {
        act.description = "Interest";
      }
    } else if (act.type === 'DIVIDEND') {
      const security = await this.security_id_to_symbol(act.securityId);
      act.description = `Dividend: ${security}`;
    } else if (act.type === 'FUNDS_CONVERSION') {
      act.description = `Funds converted: ${act.currency} from ${act.currency === 'CAD' ? 'USD' : 'CAD'}`;
    } else if (act.type === 'NON_RESIDENT_TAX') {
      act.description = "Non-resident tax";
    } else if ((act.type === 'DEPOSIT' || act.type === 'WITHDRAWAL') && act.subType === 'AFT') {
      const type_ = act.type === 'DEPOSIT' ? 'Direct deposit' : 'Pre-authorized debit';
      const direction = type_ === 'Direct deposit' ? 'from' : 'to';
      const institution = act.aftOriginatorName || act.externalCanonicalId;
      act.description = `${type_}: ${direction} ${institution}`;
    } else if (act.type === 'WITHDRAWAL' && act.subType === 'BILL_PAY') {
      const type_ = act.type.charAt(0).toUpperCase() + act.type.slice(1).toLowerCase();
      let name = act.billPayPayeeNickname;
      if (!name) {
        name = act.billPayCompanyName;
      }
      const number = act.redactedExternalAccountNumber;
      act.description = `${type_}: Bill pay ${name} ${number}`;
    } else if (act.type === 'P2P_PAYMENT' && (act.subType === 'SEND' || act.subType === 'SEND_RECEIVED')) {
      const direction = act.subType === 'SEND' ? 'sent to' : 'received from';
      const p2p_handle = act.p2pHandle;
      act.description = `Cash ${direction} ${p2p_handle}`;
    } else if (act.type === 'PROMOTION' && act.subType === 'INCENTIVE_BONUS') {
      const type_ = act.type.charAt(0).toUpperCase() + act.type.slice(1).toLowerCase();
      const subtype = act.subType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      act.description = `${type_}: ${subtype}`;
    } else if (act.type === 'REFERRAL' && act.subType === null) {
      const type_ = act.type.charAt(0).toUpperCase() + act.type.slice(1).toLowerCase();
      act.description = `${type_}`;
    } else if (act.type === 'CREDIT_CARD' && act.subType === 'PURCHASE') {
      const merchant = act.spendMerchant;
      const status = act.status === 'authorized' ? '(Pending) ' : '';
      act.description = `${status}Credit card purchase: ${merchant}`;
    } else if (act.type === 'CREDIT_CARD' && act.subType === 'HOLD') {
      const merchant = act.spendMerchant;
      const status = act.status === 'authorized' ? '(Pending) ' : '';
      act.description = `${status}Credit card refund: ${merchant}`;
    } else if (act.type === 'CREDIT_CARD' && act.subType === 'REFUND') {
      const merchant = act.spendMerchant;
      act.description = `Credit card refund: ${merchant}`;
    } else if ((act.type === 'CREDIT_CARD' && act.subType === 'PAYMENT') || act.type === 'CREDIT_CARD_PAYMENT') {
      act.description = "Credit card payment";
    } else if (act.type === 'REIMBURSEMENT' && act.subType === 'CASHBACK') {
      const program = act.rewardProgram === 'CREDIT_CARD_VISA_INFINITE_REWARDS' ? "- Visa Infinite" : '';
      act.description = `Cash back ${program}`.trim();
    } else if (act.type === 'SPEND' && act.subType === 'PREPAID') {
      const merchant = act.spendMerchant;
      act.description = `Purchase: ${merchant}`;
    }
    // TODO: Add other types as needed
  }

  async security_id_to_symbol(security_id) {
    let security_symbol = `[${security_id}]`;
    if (this.security_market_data_cache_getter) {
      const market_data = await this.get_security_market_data(security_id);
      if (market_data && typeof market_data === 'object' && market_data.stock) {
        const stock = market_data.stock;
        security_symbol = `${stock.primaryExchange}:${stock.symbol}`;
      }
    }
    return security_symbol;
  }

  async get_etf_details(funding_id) {
    return this.do_graphql_query(
      'FetchFundsTransfer',
      { id: funding_id },
      'fundsTransfer',
      'object',
    );
  }

  async get_transfer_details(transfer_id) {
    return this.do_graphql_query(
      'FetchInstitutionalTransfer',
      { id: transfer_id },
      'accountTransfer',
      'object',
    );
  }

  set_security_market_data_cache(security_market_data_cache_getter, security_market_data_cache_setter) {
    this.security_market_data_cache_getter = security_market_data_cache_getter;
    this.security_market_data_cache_setter = security_market_data_cache_setter;
  }

  async get_security_market_data(security_id, use_cache = true) {
    if (!this.security_market_data_cache_getter || !this.security_market_data_cache_setter) {
      use_cache = false;
    }

    if (use_cache) {
      const cached_value = this.security_market_data_cache_getter(security_id);
      if (cached_value) {
        return cached_value;
      }
    }

    const value = await this.do_graphql_query(
      'FetchSecurityMarketData',
      { id: security_id },
      'security',
      'object',
    );

    if (use_cache) {
      return this.security_market_data_cache_setter(security_id, value);
    }

    return value;
  }

  async get_security_historical_quotes(security_id, time_range = '1m') {
    return this.do_graphql_query(
      'FetchSecurityHistoricalQuotes',
      {
        id: security_id,
        timerange: time_range,
      },
      'security.historicalQuotes',
      'array',
    );
  }

  async get_corporate_action_child_activities(activity_canonical_id) {
    return this.do_graphql_query(
      'FetchCorporateActionChildActivities',
      {
        activityCanonicalId: activity_canonical_id,
      },
      'corporateActionChildActivities.nodes',
      'array',
    );
  }

  async get_statement_transactions(account_id, period) {
    const statements = await this.do_graphql_query(
      'FetchBrokerageMonthlyStatementTransactions',
      {
        accountId: account_id,
        period: period,
      },
      'brokerageMonthlyStatements',
      'array',
    );

    let transactions = [];
    if (Array.isArray(statements) && statements.length > 0) {
      const statement = statements[0];
      const data = statement.data || {};
      transactions = data.currentTransactions || [];
    }

    if (!transactions || transactions.length === 0) {
      return [];
    }
    if (!Array.isArray(transactions)) {
      throw new WSApiException(`Unexpected response format: ${this.get_statement_transactions.name}`, transactions);
    }

    return transactions;
  }
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WealthsimpleAPI,
    WealthsimpleAPIBase,
    WSApiException,
    CurlException,
    LoginFailedException,
    ManualLoginRequired,
    OTPRequiredException,
    UnexpectedException,
  };
}

