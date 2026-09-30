(() => {
  'use strict';

  const DATA_KEY = 'finance_tracker_data';
  const BUDGET_KEY = 'finance_tracker_monthly_budget';
  const CURRENCY_KEY = 'finance_tracker_currency';
  const SAVINGS_KEY = 'finance_tracker_savings';
  const THEME_KEY = 'finance_tracker_theme';
  const CATEGORIES = ['Groceries', 'Snacks', 'Rent', 'Utilities', 'Entertainment', 'Transport', 'Healthcare', 'Shopping', 'Salary', 'Freelance', 'Gift', 'Other'];
  const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Gift'];
  const EXPENSE_CATEGORIES = CATEGORIES.filter(category => !INCOME_CATEGORIES.includes(category));
  const CATEGORY_COLORS = ['#e6a35d', '#8078df', '#50a4a0', '#df7970', '#7094cf', '#cb7bad', '#91ae62', '#43a878', '#4fa9b1', '#a2a6b2', '#a2a6b2'];
  const $ = id => document.getElementById(id);
  let currencyCode = loadCurrency();
  let currency = makeCurrencyFormatter(currencyCode);
  const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  let transactions = loadTransactions();
  let monthlyBudget = loadBudget();
  let savingsEntries = loadSavings();
  let cashflowChart = null;
  let categoryChart = null;
  let toastTimer;

  function validTransaction(t) {
    return t && Number.isFinite(Number(t.id)) && typeof t.description === 'string' && t.description.trim() &&
      Number.isFinite(Number(t.amount)) && Number(t.amount) > 0 && ['income', 'expense'].includes(t.type) &&
      CATEGORIES.includes(t.category) && typeof t.date === 'string' && !Number.isNaN(Date.parse(t.date));
  }

  function loadTransactions() {
    try {
      const saved = JSON.parse(localStorage.getItem(DATA_KEY) || '[]');
      return Array.isArray(saved) ? saved.filter(validTransaction).map(t => ({ ...t, id: Number(t.id), amount: Number(t.amount) })) : [];
    } catch (error) {
      console.warn('Saved finance data could not be read.', error);
      return [];
    }
  }

  function loadBudget() {
    try {
      const value = Number(localStorage.getItem(BUDGET_KEY));
      return Number.isFinite(value) && value > 0 ? value : 1500;
    } catch { return 1500; }
  }

  function loadSavings() {
    try {
      const entries = JSON.parse(localStorage.getItem(SAVINGS_KEY) || '[]');
      return Array.isArray(entries) ? entries.filter(entry => Number.isFinite(Number(entry.amount)) && Number(entry.amount) > 0 && typeof entry.date === 'string' && !Number.isNaN(Date.parse(entry.date))).map(entry => ({ amount: Number(entry.amount), date: entry.date })) : [];
    } catch { return []; }
  }

  function saveSavings() {
    try { localStorage.setItem(SAVINGS_KEY, JSON.stringify(savingsEntries)); return true; }
    catch (error) { console.error('Could not save savings.', error); notify('Storage is full. Your savings change may not persist.'); return false; }
  }

  function loadCurrency() {
    try {
      const code = localStorage.getItem(CURRENCY_KEY) || 'USD';
      new Intl.NumberFormat(undefined, { style: 'currency', currency: code });
      return code;
    } catch { return 'USD'; }
  }

  function loadTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* Use the system theme when storage is unavailable. */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const button = $('themeBtn');
    const next = theme === 'dark' ? 'light' : 'dark';
    button.setAttribute('aria-label', `Switch to ${next} mode`);
    button.title = `Switch to ${next} mode`;
    button.innerHTML = theme === 'dark'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.2 15.2A8.4 8.4 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"/></svg>';
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Theme remains active for this page view. */ }
  }

  function makeCurrencyFormatter(code) {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }); }
    catch { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }); }
  }

  function updateCategoryOptions() {
    const select = $('category');
    const categories = $('type').value === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const previous = select.value;
    select.innerHTML = categories.map(category => `<option>${escapeHTML(category)}</option>`).join('');
    select.value = categories.includes(previous) ? previous : categories[0];
  }

  function setCurrency(code) {
    try { new Intl.NumberFormat(undefined, { style: 'currency', currency: code }); }
    catch { notify('That currency is not supported by this browser.'); return; }
    currencyCode = code;
    currency = makeCurrencyFormatter(code);
    try { localStorage.setItem(CURRENCY_KEY, code); } catch (error) { console.warn('Currency preference could not be saved.', error); }
    const parts = currency.formatToParts(0);
    $('currencyCode').textContent = code;
    $('currencySymbol').textContent = parts.find(part => part.type === 'currency')?.value || code;
    $('currencySelect').value = code;
    $('transactionForm').querySelector('.amount-input > span').textContent = parts.find(part => part.type === 'currency')?.value || code;
    $('budgetDialog').querySelector('.amount-input > span').textContent = parts.find(part => part.type === 'currency')?.value || code;
    render();
  }

  function saveTransactions() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(transactions)); return true; }
    catch (error) { console.error('Could not save transactions.', error); notify('Storage is full. Your change may not persist.'); return false; }
  }

  function currentMonthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function dateForInput(value) {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function monthLabel(key) {
    const [year, month] = key.split('-').map(Number);
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
  }

  function monthTransactions() {
    const key = currentMonthKey();
    return transactions.filter(t => currentMonthKey(new Date(t.date)) === key);
  }

  function notify(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function totalsFor(items) {
    return items.reduce((totals, t) => {
      totals[t.type] += t.amount;
      return totals;
    }, { income: 0, expense: 0 });
  }

  function renderMetrics() {
    const totals = totalsFor(transactions);
    $('balanceValue').textContent = currency.format(totals.income - totals.expense);
    $('incomeValue').textContent = currency.format(totals.income);
    $('expenseValue').textContent = currency.format(totals.expense);
  }

  function renderBudget() {
    const spent = totalsFor(monthTransactions()).expense;
    const percent = monthlyBudget > 0 ? spent / monthlyBudget * 100 : 0;
    const barPercent = Math.min(100, percent);
    $('budgetSpent').textContent = currency.format(spent);
    $('budgetTarget').textContent = `of ${currency.format(monthlyBudget)}`;
    $('budgetSubtitle').textContent = `${monthLabel(currentMonthKey())} spending plan.`;
    $('budgetProgress').style.width = `${barPercent}%`;
    $('budgetProgressTrack').classList.toggle('over', percent > 100);
    $('budgetProgressTrack').setAttribute('aria-valuenow', String(Math.round(barPercent)));
    $('budgetPercent').textContent = `${Math.round(percent)}%`;
    $('budgetMessage').textContent = percent > 100 ? `${currency.format(spent - monthlyBudget)} over budget` : `${currency.format(monthlyBudget - spent)} left to spend`;
  }

  function transactionIcon(type) {
    return type === 'income'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14m6-6-6 6-6-6"/></svg>';
  }

  function populateMonthFilter() {
    const select = $('monthFilter');
    const selected = select.value || 'all';
    const months = [...new Set(transactions.map(t => currentMonthKey(new Date(t.date))))].sort().reverse();
    select.innerHTML = '<option value="all">All dates</option>' + months.map(key => `<option value="${key}">${escapeHTML(monthLabel(key))}</option>`).join('');
    if (months.includes(selected)) select.value = selected;
  }

  function renderTransactions() {
    const term = $('searchInput').value.trim().toLocaleLowerCase();
    const type = $('typeFilter').value;
    const month = $('monthFilter').value;
    const filtered = transactions.filter(t => {
      const matchesText = `${t.description} ${t.category}`.toLocaleLowerCase().includes(term);
      const matchesType = type === 'all' || t.type === type;
      const matchesMonth = month === 'all' || currentMonthKey(new Date(t.date)) === month;
      return matchesText && matchesType && matchesMonth;
    }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    $('historyCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'}${filtered.length !== transactions.length ? ` of ${transactions.length}` : ''}`;
    if (!filtered.length) {
      $('transactionList').innerHTML = transactions.length
        ? '<div class="empty-state">No transactions match these filters.</div>'
        : '<div class="empty-state branded-empty"><img class="logo-for-light" src="assets/Docket light.png" alt="Docket logo"><img class="logo-for-dark" src="assets/Docket Logo Dark.png" alt=""><strong>Your docket is clear.</strong><span>Add a transaction to get started.</span></div>';
      return;
    }
    $('transactionList').innerHTML = filtered.map(t => {
      const date = dateFormat.format(new Date(t.date));
      return `<article class="transaction"><div class="tx-main"><span class="tx-icon ${t.type}" aria-hidden="true">${transactionIcon(t.type)}</span><div class="tx-copy"><div class="tx-title">${escapeHTML(t.description)}</div><div class="tx-meta"><span>${escapeHTML(date)}</span><span class="tag">${escapeHTML(t.category)}</span></div></div></div><div class="tx-amount ${t.type}">${t.type === 'income' ? '+' : '−'}${currency.format(t.amount)}</div><button class="delete-button" type="button" data-delete="${t.id}" aria-label="Delete ${escapeHTML(t.description)}" title="Delete transaction"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16m-10 0V4h4v3m4 0-1 13H7L6 7m3 4v5m6-5v5"/></svg></button></article>`;
    }).join('');
  }

  function renderCategories() {
    const expenses = monthTransactions().filter(t => t.type === 'expense');
    const grouped = expenses.reduce((result, t) => {
      result[t.category] = (result[t.category] || 0) + t.amount;
      return result;
    }, {});
    const rows = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
    const canvas = $('categoryChart');
    const fallback = $('categoryChartFallback');
    if (rows.length && window.Chart) {
      canvas.hidden = false;
      fallback.hidden = true;
      const data = {
        labels: rows.map(([category]) => category),
        datasets: [{ data: rows.map(([, amount]) => amount), backgroundColor: rows.map(([category]) => CATEGORY_COLORS[CATEGORIES.indexOf(category)] || CATEGORY_COLORS.at(-1)), borderColor: '#fff', borderWidth: 3, hoverOffset: 5 }]
      };
      const options = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => ` ${context.label}: ${currency.format(context.raw)}` } } } };
      if (categoryChart) {
        categoryChart.data = data;
        categoryChart.options = options;
        categoryChart.update();
      } else {
        categoryChart = new Chart(canvas, { type: 'pie', data, options });
      }
    } else {
      if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
      canvas.hidden = true;
      fallback.hidden = false;
      fallback.textContent = rows.length ? 'Chart unavailable. Check your internet connection and reload.' : 'Add an expense to see this month’s category breakdown.';
    }
    $('categoryBreakdown').innerHTML = rows.length ? rows.map(([category, amount]) => {
      const color = CATEGORY_COLORS[CATEGORIES.indexOf(category)] || CATEGORY_COLORS.at(-1);
      return `<div class="category-row"><div class="category-label"><i class="category-color" style="background:${color}"></i><span>${escapeHTML(category)}</span></div><span class="category-value">${currency.format(amount)}</span></div>`;
    }).join('') : '<div class="category-empty">No expenses this month yet.</div>';
  }

  function savingsAvailable() {
    const current = totalsFor(monthTransactions());
    const savedThisMonth = savingsEntries.filter(entry => currentMonthKey(new Date(entry.date)) === currentMonthKey()).reduce((sum, entry) => sum + entry.amount, 0);
    return Math.max(0, current.income - current.expense - savedThisMonth);
  }

  function renderSavings() {
    const balance = savingsEntries.reduce((sum, entry) => sum + entry.amount, 0);
    $('savingsBalance').textContent = currency.format(balance);
    $('savingsAvailable').textContent = currency.format(savingsAvailable());
    $('savingsAmount').max = String(savingsAvailable());
  }

  function answerQuestion(question) {
    const q = question.toLocaleLowerCase();
    const month = totalsFor(monthTransactions());
    if (/sav(e|ings|ed|able)/.test(q)) return `You can save ${currency.format(savingsAvailable())} more this month. Your savings account balance is ${currency.format(savingsEntries.reduce((sum, entry) => sum + entry.amount, 0))}.`;
    if (/income|earn|received/.test(q)) return `Your income this month is ${currency.format(month.income)}.`;
    if (/spent|spending|expense|expenses|cost/.test(q)) return `Your expenses this month are ${currency.format(month.expense)}.`;
    if (/balance|net|left/.test(q)) return `Your net balance this month is ${currency.format(month.income - month.expense)}.`;
    if (/budget|limit/.test(q)) return `You have spent ${currency.format(month.expense)} of your ${currency.format(monthlyBudget)} monthly budget.`;
    if (/category|categories|where/.test(q)) {
      const byCategory = monthTransactions().filter(t => t.type === 'expense').reduce((result, t) => { result[t.category] = (result[t.category] || 0) + t.amount; return result; }, {});
      const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
      return top ? `Your biggest expense category this month is ${top[0]} at ${currency.format(top[1])}.` : 'There are no expenses recorded this month yet.';
    }
    if (/how|add|record|track/.test(q)) return 'To add a transaction, choose its type and category, enter the amount, then press Add transaction. Income categories include Salary, Freelance, and Gift.';
    return 'I can answer questions about this month’s income, expenses, budget, spending categories, and savings. Try “How much did I spend?”';
  }

  function renderChart() {
    if (!window.Chart) {
      $('chartFallback').hidden = false;
      return;
    }
    $('chartFallback').hidden = true;
    const count = Number($('chartRange').value);
    const now = new Date();
    const labels = [];
    const keys = [];
    for (let offset = count - 1; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      keys.push(currentMonthKey(date));
      labels.push(new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date));
    }
    const income = keys.map(key => transactions.filter(t => t.type === 'income' && currentMonthKey(new Date(t.date)) === key).reduce((sum, t) => sum + t.amount, 0));
    const expense = keys.map(key => transactions.filter(t => t.type === 'expense' && currentMonthKey(new Date(t.date)) === key).reduce((sum, t) => sum + t.amount, 0));
    const data = { labels, datasets: [
      { label: 'Income', data: income, backgroundColor: '#4aaf84', borderRadius: 5, maxBarThickness: 18 },
      { label: 'Expenses', data: expense, backgroundColor: '#ed8277', borderRadius: 5, maxBarThickness: 18 }
    ] };
    const options = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#292d39', padding: 10, callbacks: { label: context => ` ${context.dataset.label}: ${currency.format(context.raw)}` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#969ba5', font: { family: 'DM Sans', size: 9 } } }, y: { beginAtZero: true, border: { display: false, dash: [3, 4] }, grid: { color: '#eff0f3' }, ticks: { color: '#a0a5ae', font: { family: 'DM Sans', size: 9 }, maxTicksLimit: 5, callback: value => currency.format(value) } } } };
    if (cashflowChart) {
      cashflowChart.data = data;
      cashflowChart.options = options;
      cashflowChart.update();
    } else {
      cashflowChart = new Chart($('cashflowChart'), { type: 'bar', data, options });
    }
  }

  function render() {
    renderMetrics();
    renderBudget();
    populateMonthFilter();
    renderTransactions();
    renderCategories();
    renderSavings();
    renderChart();
  }

  $('todayLabel').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
  $('date').value = dateForInput(new Date());
  setTheme(loadTheme());
  updateCategoryOptions();
  setCurrency(currencyCode);
  $('themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('type').addEventListener('change', updateCategoryOptions);

  $('savingsForm').addEventListener('submit', event => {
    event.preventDefault();
    const amount = Number($('savingsAmount').value);
    const available = savingsAvailable();
    if (!Number.isFinite(amount) || amount <= 0 || amount > available) {
      $('savingsAmount').setCustomValidity(`Enter an amount up to ${currency.format(available)}.`);
      $('savingsAmount').reportValidity();
      return;
    }
    $('savingsAmount').setCustomValidity('');
    const [year, month, day] = dateForInput(new Date()).split('-').map(Number);
    savingsEntries.push({ amount, date: new Date(year, month - 1, day, 12).toISOString() });
    saveSavings();
    $('savingsAmount').value = '';
    renderSavings();
    notify('Money added to savings.');
  });
  $('savingsAmount').addEventListener('input', () => $('savingsAmount').setCustomValidity(''));

  $('assistantForm').addEventListener('submit', event => {
    event.preventDefault();
    const question = $('assistantQuestion').value.trim();
    if (!question) return;
    const messages = $('assistantMessages');
    messages.innerHTML = `<p class="assistant-question">${escapeHTML(question)}</p><p class="assistant-reply">${escapeHTML(answerQuestion(question))}</p>`;
    $('assistantQuestion').value = '';
  });

  $('transactionForm').addEventListener('submit', event => {
    event.preventDefault();
    const amount = Number($('amount').value);
    const type = $('type').value;
    const category = $('category').value;
    const date = $('date').value;
    if (!Number.isFinite(amount) || amount <= 0) { $('amount').setCustomValidity('Enter an amount greater than zero.'); $('amount').reportValidity(); return; }
    $('amount').setCustomValidity('');
    if (!date || !CATEGORIES.includes(category) || !['income', 'expense'].includes(type)) { notify('Check the date, type, and category.'); return; }
    const [year, month, day] = date.split('-').map(Number);
    const transactionDate = new Date(year, month - 1, day, 12).toISOString();
    transactions.push({ id: Date.now() + Math.floor(Math.random() * 1000), description: category, amount, type, category, date: transactionDate });
    saveTransactions();
    $('amount').value = '';
    $('amount').setCustomValidity('');
    $('amount').focus();
    $('formStatus').textContent = `Added ${category} ${type} for ${currency.format(amount)}.`;
    $('formStatus').hidden = false;
    render();
    notify('Transaction added.');
  });

  $('amount').addEventListener('input', () => $('amount').setCustomValidity(''));
  $('transactionList').addEventListener('click', event => {
    const button = event.target.closest('[data-delete]');
    if (!button) return;
    transactions = transactions.filter(t => t.id !== Number(button.dataset.delete));
    saveTransactions();
    render();
    notify('Transaction deleted.');
  });
  ['searchInput', 'typeFilter', 'monthFilter'].forEach(id => $(id).addEventListener(id === 'searchInput' ? 'input' : 'change', renderTransactions));
  $('chartRange').addEventListener('change', renderChart);

  $('budgetEditBtn').addEventListener('click', () => {
    $('budgetAmount').value = monthlyBudget;
    $('budgetDialog').showModal();
    $('budgetAmount').focus();
  });
  $('budgetClose').addEventListener('click', () => $('budgetDialog').close());
  $('budgetCancel').addEventListener('click', () => $('budgetDialog').close());
  $('budgetForm').addEventListener('submit', event => {
    event.preventDefault();
    const amount = Number($('budgetAmount').value);
    if (!Number.isFinite(amount) || amount <= 0) { $('budgetAmount').reportValidity(); return; }
    monthlyBudget = amount;
    try { localStorage.setItem(BUDGET_KEY, String(monthlyBudget)); } catch (error) { console.warn('Budget preference could not be saved.', error); }
    $('budgetDialog').close();
    renderBudget();
    notify('Monthly budget updated.');
  });

  $('currencyBtn').addEventListener('click', () => {
    $('currencySelect').value = currencyCode;
    $('locationStatus').textContent = '';
    $('locationStatus').classList.remove('error');
    $('currencyDialog').showModal();
  });
  $('currencyClose').addEventListener('click', () => $('currencyDialog').close());
  $('currencyCancel').addEventListener('click', () => $('currencyDialog').close());
  $('currencySelect').addEventListener('change', event => {
    setCurrency(event.target.value);
    $('currencyDialog').close();
    notify(`Currency set to ${event.target.value}.`);
  });
  $('useLocationBtn').addEventListener('click', () => {
    const status = $('locationStatus');
    status.classList.remove('error');
    if (!navigator.geolocation) {
      status.textContent = 'Location is unavailable in this browser. Choose a currency manually below.';
      status.classList.add('error');
      return;
    }
    status.textContent = 'Waiting for location permission…';
    navigator.geolocation.getCurrentPosition(async position => {
      status.textContent = 'Finding your country and local currency…';
      try {
        const { latitude, longitude } = position.coords;
        const geoResponse = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=en`);
        if (!geoResponse.ok) throw new Error('Could not look up your country.');
        const location = await geoResponse.json();
        if (!location.countryCode) throw new Error('Could not identify your country.');
        const currencyResponse = await fetch(`https://restcountries.com/v3.1/alpha/${encodeURIComponent(location.countryCode)}?fields=currencies`);
        if (!currencyResponse.ok) throw new Error('Could not look up your local currency.');
        const country = await currencyResponse.json();
        const code = Object.keys(country.currencies || {})[0];
        if (!code) throw new Error('No currency was found for your country. Choose one manually.');
        setCurrency(code);
        $('currencyDialog').close();
        notify(`Currency set to ${code}.`);
      } catch (error) {
        console.warn('Location-based currency lookup failed.', error);
        status.textContent = `${error.message || 'Currency lookup failed.'} You can choose a currency manually below.`;
        status.classList.add('error');
      }
    }, error => {
      status.textContent = error.code === 1
        ? 'Location permission was denied. Choose a currency manually below or allow location in browser settings.'
        : error.code === 2
          ? 'Your location could not be determined. Choose a currency manually below.'
          : 'Location request timed out. Try again or choose a currency manually below.';
      status.classList.add('error');
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  });

  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(transactions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `docket-transactions-${currentMonthKey()}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('JSON backup downloaded.');
  });

  $('exportExcelBtn').addEventListener('click', async () => {
    const rows = [
      ['Description', 'Amount', 'Type', 'Category', 'Date'],
      ...transactions.map(t => [t.description, t.amount, t.type, t.category, dateForInput(t.date)])
    ];
    try {
      const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: Math.min(50, rows.reduce((width, row) => Math.max(width, String(row[0] ?? '').length), 16)) },
        { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 14 }
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');
      XLSX.writeFileXLSX(workbook, `docket-transactions-${currentMonthKey()}.xlsx`);
      notify('Excel workbook downloaded.');
    } catch (error) {
      console.error('Excel export is unavailable; downloading CSV instead.', error);
      const quote = value => `"${String(value).replace(/"/g, '""')}"`;
      const csv = rows.map(row => row.map(quote).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `docket-transactions-${currentMonthKey()}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Excel export unavailable. A CSV file was downloaded instead.');
    }
  });

  $('clearBtn').addEventListener('click', () => {
    if (!transactions.length) { notify('There are no transactions to clear.'); return; }
    if (!window.confirm('Delete all transactions? This cannot be undone.')) return;
    transactions = [];
    saveTransactions();
    render();
    notify('All transactions cleared.');
  });
})();
