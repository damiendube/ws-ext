// Popup script for Wealthsimple ROI Analyzer

let roiChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  const fetchButton = document.getElementById('fetchData');
  const loadingDiv = document.getElementById('loading');
  const chartContainer = document.getElementById('chartContainer');
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

  fetchButton.addEventListener('click', async () => {
    try {
      fetchButton.disabled = true;
      loadingDiv.classList.remove('hidden');
      chartContainer.classList.add('hidden');
      errorDiv.classList.add('hidden');

      // Get selected account ID and period
      const accountSelect = document.getElementById('accountSelect');
      const periodSelect = document.getElementById('periodSelect');
      const selectedAccountId = accountSelect.value;
      const rollingWindow = parseInt(periodSelect.value, 10);

      // Send message to background script to fetch data
      // The background script will use sender.tab to get the current tab
      const response = await chrome.runtime.sendMessage({
        action: 'fetchROIData',
        tabId: tab.id,
        accountId: selectedAccountId || null,
        rollingWindow: rollingWindow
      });

      if (response.error) {
        showError(response.error);
        return;
      }

      if (response.data) {
        displayChart(response.data);
      }
    } catch (error) {
      showError(`Error: ${error.message}`);
    } finally {
      fetchButton.disabled = false;
      loadingDiv.classList.add('hidden');
    }
  });
});

function displayChart(data) {
  // Check if Chart.js is loaded
  if (typeof Chart === 'undefined') {
    showError('Chart.js library failed to load. Please check your internet connection or reload the extension.');
    console.error('Chart.js is not available');
    return;
  }

  const chartContainer = document.getElementById('chartContainer');
  const canvas = document.getElementById('roiChart');
  chartContainer.classList.remove('hidden');

  // Destroy existing chart if it exists
  if (roiChart) {
    roiChart.destroy();
  }

  // Create new chart
  const ctx = canvas.getContext('2d');
  roiChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels || [],
      datasets: [{
        label: 'ROI (%)',
        data: data.values || [],
        borderColor: '#0066cc',
        backgroundColor: 'rgba(0, 102, 204, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        title: {
          display: true,
          text: 'Return on Investment Over Time'
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function(value) {
              return value + '%';
            }
          }
        }
      }
    }
  });
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

