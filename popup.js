// Popup script for Wealthsimple ROI Analyzer

let roiChart = null;
let assetChart = null;
let countryChart = null;
let historyPoints = [];
let selectedRange = 'ALL';
let selectedReturnType = 'cumulative';

const RANGE_LABELS = {
  '1D': '1 day',
  '1W': '1 week',
  '1M': '1 month',
  '3M': '3 months',
  '6M': '6 months',
  YTD: 'Year to date',
  '1Y': '1 year',
  ALL: 'All time',
};

const ASSET_COLORS = {
  Cash: '#7d8b99',
  Bonds: '#c4a35a',
  Stocks: '#0066cc',
  Crypto: '#e09f3e',
  Other: '#9aa0a6',
};

const COUNTRY_COLORS = [
  '#0066cc', '#2a9d8f', '#e09f3e', '#6a4c93', '#c44536',
  '#4c6ef5', '#2b8a3e', '#e67700', '#5c7cfa', '#868e96',
];

document.addEventListener('DOMContentLoaded', async () => {
  const fetchButton = document.getElementById('fetchData');
  const loadingDiv = document.getElementById('loading');
  const errorDiv = document.getElementById('error');
  const accountSelect = document.getElementById('accountSelect');

  // Check if Chart.js is loaded
  if (typeof Chart === 'undefined') {
    showError('Chart.js library failed to load. Please reload the extension.');
    fetchButton.disabled = true;
    console.error('Chart.js is not available');
    return;
  }

  // Check if user is on wealthsimple.com
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url || !tab.url.includes('wealthsimple.com')) {
    showError('Please navigate to wealthsimple.com to use this extension');
    fetchButton.disabled = true;
    accountSelect.disabled = true;
    return;
  }

  // Load accounts into dropdown
  await loadAccounts();

  document.getElementById('roiRanges').addEventListener('click', (event) => {
    const button = event.target.closest('.range-btn');
    if (!button || !historyPoints.length) {
      return;
    }
    selectedRange = button.dataset.range;
    for (const rangeButton of document.querySelectorAll('.range-btn')) {
      rangeButton.classList.toggle('active', rangeButton === button);
    }
    renderRoi();
  });

  document.getElementById('returnType').addEventListener('change', (event) => {
    selectedReturnType = event.target.value;
    if (!historyPoints.length) {
      return;
    }
    renderRoi();
  });

  fetchButton.addEventListener('click', async () => {
    try {
      fetchButton.disabled = true;
      loadingDiv.classList.remove('hidden');
      document.getElementById('charts').classList.add('hidden');
      errorDiv.classList.add('hidden');

      const accountSelect = document.getElementById('accountSelect');
      const selectedAccountId = accountSelect.value;

      const response = await chrome.runtime.sendMessage({
        action: 'fetchROIData',
        tabId: tab.id,
        accountId: selectedAccountId || null,
      });

      if (response.error) {
        showError(response.error);
        return;
      }

      if (response.data) {
        displayCharts(response.data);
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
    } finally {
      fetchButton.disabled = false;
      loadingDiv.classList.add('hidden');
    }
  });
});

function money(value) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value) {
  return `${Number(value).toFixed(1)}%`;
}

function signedPercent(value) {
  const number = Number(value);
  const text = `${Math.abs(number).toFixed(2)}%`;
  if (number > 0) {
    return `+${text}`;
  }
  if (number < 0) {
    return `-${text}`;
  }
  return text;
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rangeStartDate(range, today) {
  if (range === 'ALL') {
    return null;
  }
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (range === 'YTD') {
    return `${date.getFullYear()}-01-01`;
  }
  if (range === '1D') {
    date.setDate(date.getDate() - 1);
  } else if (range === '1W') {
    date.setDate(date.getDate() - 7);
  } else if (range === '1M') {
    date.setMonth(date.getMonth() - 1);
  } else if (range === '3M') {
    date.setMonth(date.getMonth() - 3);
  } else if (range === '6M') {
    date.setMonth(date.getMonth() - 6);
  } else if (range === '1Y') {
    date.setFullYear(date.getFullYear() - 1);
  }
  return isoDate(date);
}

function baselineIndex(points, start) {
  if (!start) {
    return 0;
  }
  let index = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].date <= start) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}

function periodReturn(points, startIndex) {
  let baseIndex = startIndex;
  while (baseIndex < points.length && !(points[baseIndex].nlv > 0)) {
    baseIndex += 1;
  }
  if (baseIndex >= points.length) {
    return { labels: [], values: [] };
  }
  const base = points[baseIndex];
  const labels = [];
  const values = [];
  for (let i = baseIndex; i < points.length; i++) {
    const point = points[i];
    const gain = (point.nlv - base.nlv) - (point.deposits - base.deposits);
    labels.push(point.date);
    values.push((gain / base.nlv) * 100);
  }
  return { labels, values };
}

function buildReturnSeries(points, range, today) {
  if (!points.length) {
    return { labels: [], values: [] };
  }
  if (range === 'ALL') {
    const labels = [];
    const values = [];
    for (const point of points) {
      if (!(point.deposits > 0)) {
        continue;
      }
      labels.push(point.date);
      values.push(((point.nlv - point.deposits) / point.deposits) * 100);
    }
    if (labels.length) {
      return { labels, values };
    }
  }
  return periodReturn(points, baselineIndex(points, rangeStartDate(range, today)));
}

function sliceFromRange(points, range, today) {
  if (!points.length) {
    return [];
  }
  let startIndex = baselineIndex(points, rangeStartDate(range, today));
  while (startIndex < points.length && !(points[startIndex].nlv > 0)) {
    startIndex += 1;
  }
  return points.slice(startIndex);
}

function daySpan(start, end) {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  return (Date.UTC(endYear, endMonth - 1, endDay) - Date.UTC(startYear, startMonth - 1, startDay)) / 86400000;
}

function linkedReturn(segment) {
  if (segment.length < 2) {
    return null;
  }
  let factor = 1;
  for (let i = 1; i < segment.length; i++) {
    const previous = segment[i - 1];
    const point = segment[i];
    if (!(previous.nlv > 0)) {
      continue;
    }
    const gain = (point.nlv - previous.nlv) - (point.deposits - previous.deposits);
    factor *= 1 + gain / previous.nlv;
  }
  return (factor - 1) * 100;
}

function buildMonthlySeries(points, range, today) {
  const slice = sliceFromRange(points, range, today);
  const labels = [];
  const values = [];
  let index = 0;
  while (index < slice.length) {
    const month = slice[index].date.slice(0, 7);
    let end = index;
    while (end + 1 < slice.length && slice[end + 1].date.startsWith(month)) {
      end += 1;
    }
    const segment = slice.slice(index > 0 ? index - 1 : index, end + 1);
    const value = linkedReturn(segment);
    const span = daySpan(segment[0].date, segment[segment.length - 1].date);
    if (value != null && Number.isFinite(value) && span >= 20) {
      labels.push(slice[end].date);
      values.push(value);
    }
    index = end + 1;
  }
  const headline = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  return { labels, values, headline };
}

function buildDisplaySeries(points, range, returnType, today) {
  if (returnType === 'monthly') {
    return buildMonthlySeries(points, range, today);
  }
  const series = buildReturnSeries(points, range, today);
  const values = series.values || [];
  return {
    labels: series.labels || [],
    values,
    headline: values.length ? values[values.length - 1] : null,
  };
}

function renderRoi() {
  displayRoiChart(buildDisplaySeries(historyPoints, selectedRange, selectedReturnType, new Date()));
}

function formatTick(iso, range) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (range === 'ALL' || range === '1Y') {
    return date.toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
  }
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
}

function displayCharts(data) {
  if (typeof Chart === 'undefined') {
    showError('Chart.js library failed to load. Rebuild the extension with npm run build.');
    console.error('Chart.js is not available');
    return;
  }

  document.getElementById('charts').classList.remove('hidden');
  historyPoints = data.history || [];
  renderRoi();
  displayAssetChart(data.assets || { labels: [], values: [], percents: [] });
  displayCountryChart(data.countries || { labels: [], values: [], percents: [], unknownSymbols: [], excluded: [] });
}

function displayRoiChart(data) {
  const canvas = document.getElementById('roiChart');
  if (roiChart) {
    roiChart.destroy();
  }

  const values = data.values || [];
  const labels = data.labels || [];
  const headline = data.headline == null ? (values.length ? values[values.length - 1] : null) : data.headline;
  const latestEl = document.getElementById('roiLatest');
  const rangeLabel = document.getElementById('roiRangeLabel');
  rangeLabel.textContent = RANGE_LABELS[selectedRange] || '';

  const showStat = (value) => {
    const missing = value == null || Number.isNaN(Number(value));
    latestEl.textContent = missing ? '' : signedPercent(value);
    latestEl.classList.toggle('positive', !missing && value > 0);
    latestEl.classList.toggle('negative', !missing && value < 0);
  };
  showStat(headline);

  const positive = headline == null || headline >= 0;
  const line = positive ? '#047857' : '#b42318';
  const fill = positive ? 'rgba(4, 120, 87, 0.12)' : 'rgba(180, 35, 24, 0.12)';
  const up = '#047857';
  const down = '#b42318';
  const monthly = selectedReturnType === 'monthly';
  const barColors = values.map((value) => (value >= 0 ? up : down));
  const datasets = monthly
    ? [{
      label: 'Month',
      data: values,
      backgroundColor: barColors,
      hoverBackgroundColor: barColors,
      borderWidth: 0,
      borderRadius: 2,
      maxBarThickness: 28,
      order: 1,
    }]
    : [{
      label: 'Return',
      data: values,
      borderColor: line,
      backgroundColor: fill,
      borderWidth: 2,
      pointRadius: values.length > 1 ? 0 : 4,
      pointHoverRadius: 4,
      tension: 0,
      fill: true,
    }];
  if (monthly && headline != null) {
    datasets.push({
      type: 'line',
      label: 'Average',
      data: values.map(() => headline),
      borderColor: '#9ca3af',
      borderDash: [4, 4],
      borderWidth: 1,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      order: 0,
    });
  }

  roiChart = new Chart(canvas, {
    type: monthly ? 'bar' : 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      onHover: function(event, elements) {
        const hit = elements.find((element) => element.datasetIndex === 0);
        if (!hit) {
          return;
        }
        showStat(values[hit.index]);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const text = signedPercent(context.parsed.y);
              return context.dataset.label === 'Average' ? `Average ${text}` : text;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxTicksLimit: 6,
            color: '#6b7280',
            maxRotation: 0,
            callback: function(value) {
              const label = this.getLabelForValue(value);
              return formatTick(label, selectedRange);
            }
          }
        },
        y: {
          afterDataLimits: function(scale) {
            if (monthly) {
              scale.min = Math.min(scale.min, 0);
              scale.max = Math.max(scale.max, 0);
            }
            const span = (scale.max - scale.min) || Math.abs(scale.max) || 1;
            const pad = span * 0.08;
            if (scale.min >= 0) {
              scale.min = 0;
            } else {
              scale.min -= pad;
            }
            if (monthly && scale.max <= 0) {
              scale.max = 0;
            } else {
              scale.max += pad;
            }
          },
          ticks: {
            maxTicksLimit: 5,
            color: '#6b7280',
            callback: function(value) {
              const digits = Math.abs(Number(value)) >= 10 ? 0 : 1;
              return `${Number(value).toFixed(digits)}%`;
            }
          }
        }
      }
    }
  });

  canvas.onmouseleave = () => showStat(headline);
}

function displayAssetChart(data) {
  const canvas = document.getElementById('assetChart');
  if (assetChart) {
    assetChart.destroy();
  }

  const labels = data.labels || [];
  const percents = data.percents || [];
  assetChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: data.values || [],
        backgroundColor: labels.map((label) => ASSET_COLORS[label] || '#9aa0a6'),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 10,
            color: '#374151',
            generateLabels: function(chart) {
              const dataset = chart.data.datasets[0];
              return chart.data.labels.map((label, index) => ({
                text: `${label}  ${percent(percents[index] || 0)}`,
                fillStyle: dataset.backgroundColor[index],
                strokeStyle: '#ffffff',
                lineWidth: 0,
                hidden: false,
                index,
                datasetIndex: 0,
              }));
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const share = percents[context.dataIndex];
              return `${context.label}: ${money(context.parsed)} (${percent(share || 0)})`;
            }
          }
        }
      }
    },
    plugins: [{
      id: 'allocationCenter',
      afterDraw: function(chart) {
        const values = chart.data.datasets[0].data;
        if (!values.length) {
          return;
        }
        const top = values.reduce((best, value, index) => value > values[best] ? index : best, 0);
        const area = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#111827';
        ctx.font = '600 18px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(percent(percents[top] || 0), (area.left + area.right) / 2, (area.top + area.bottom) / 2 - 8);
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(chart.data.labels[top], (area.left + area.right) / 2, (area.top + area.bottom) / 2 + 12);
        ctx.restore();
      }
    }]
  });

  const note = document.getElementById('allocationNote');
  const holdings = data.otherHoldings || [];
  note.textContent = holdings.length
    ? `Other: ${holdings.map((holding) => `${holding.label} ${percent(holding.percent)}`).join(', ')}`
    : '';
}

function displayCountryChart(data) {
  const canvas = document.getElementById('countryChart');
  if (countryChart) {
    countryChart.destroy();
  }

  const labels = data.labels || [];
  const percents = data.percents || [];
  canvas.parentElement.style.height = `${Math.min(280, Math.max(120, labels.length * 28 + 8))}px`;
  countryChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: data.values || [],
        backgroundColor: labels.map((label, index) => label === 'Unknown' ? '#868e96' : COUNTRY_COLORS[index % COUNTRY_COLORS.length]),
        borderRadius: 4,
        maxBarThickness: 14,
        barPercentage: 0.7,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const share = percents[context.dataIndex];
              return `${money(context.parsed.x)} (${percent(share || 0)})`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { display: false },
          border: { display: false },
          ticks: { display: false }
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            autoSkip: false,
            color: '#374151',
            font: { size: 12 },
            callback: function(value) {
              const label = this.getLabelForValue(value);
              return `${label}   ${percent(percents[value] || 0)}`;
            }
          }
        }
      }
    }
  });

  const note = document.getElementById('countryNote');
  const lines = ['Weights come from each fund\'s latest published holdings. Cash, crypto, and gold are left out.'];
  if (data.unknownSymbols && data.unknownSymbols.length > 0) {
    lines.push(`Unknown: ${data.unknownSymbols.join(', ')}`);
  }
  note.textContent = lines.join(' ');
}

function showError(message) {
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
}

async function loadAccounts() {
  const accountSelect = document.getElementById('accountSelect');
  try {
    accountSelect.innerHTML = '<option value="">Loading accounts...</option>';
    accountSelect.disabled = true;

    // Request accounts from background script
    const response = await chrome.runtime.sendMessage({
      action: 'getAccounts'
    });

    if (response.error) {
      accountSelect.innerHTML = `<option value="">Error: ${response.error}</option>`;
      return;
    }

    if (response.accounts && response.accounts.length > 0) {
      // Clear and populate dropdown
      accountSelect.innerHTML = '<option value="">All Accounts</option>';
      
      for (const account of response.accounts) {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = `${account.description} (${account.number || account.id})`;
        accountSelect.appendChild(option);
      }
      
      accountSelect.disabled = false;
    } else {
      accountSelect.innerHTML = '<option value="">No accounts found</option>';
    }
  } catch (error) {
    accountSelect.innerHTML = `<option value="">Error loading accounts</option>`;
    console.error('Error loading accounts:', error);
  }
}

