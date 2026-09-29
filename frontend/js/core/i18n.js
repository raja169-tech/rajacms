/**
 * i18n.js — Multilingual support (English, Hindi, Marathi)
 * Usage:
 *   import { t, setLang, getLang } from './i18n.js';
 *   t('dashboard')  => "Dashboard" / "डैशबोर्ड" / "डॅशबोर्ड"
 *
 *   In HTML: <span data-i18n="dashboard"></span>
 *   Call applyTranslations() after page renders to auto-fill all data-i18n elements.
 */

const TRANSLATIONS = {
  en: {
    // Navigation
    dashboard: 'Dashboard',
    txn_queue: 'Txn Queue',
    clients: 'Clients',
    employees: 'Employees',
    bank_accounts: 'Bank Accounts',
    reports: 'Reports',
    logout: 'Log out',

    // Auth
    welcome: 'Welcome to CMS',
    login_subtitle: 'Log in to manage your cash ledger',
    username_label: 'Client Code or Username',
    password_label: 'Password',
    sign_in: 'Sign In',
    admin_login: 'Admin Login',
    employee_login: 'Employee Login',
    client_login: 'Client Login',
    admin_creds: 'Enter your admin credentials',
    employee_creds: 'Enter your employee credentials',
    client_creds: 'Enter your client code',
    admin_username: 'Admin Username',
    employee_username: 'Employee Username',
    client_code: 'Client Code',

    // Dashboard
    overview: 'Overview',
    pending_txns: 'Pending Transactions',
    total_clients: 'Total Clients',
    monthly_volume: 'Monthly Pay-In',
    fees_collected: 'Fees Collected',
    net_volume: 'Net Volume',
    pay_out: 'Pay-Out',
    last_7_days: 'Last 7 Days',
    pay_in: 'Pay In',
    quick_actions: 'Quick Actions',
    new_pay_in: 'New Pay In',
    new_pay_out: 'Request Pay Out',
    my_balance: 'My Balance',
    available_balance: 'Available Balance',

    // Tables
    code: 'Code',
    name: 'Name',
    fee_pct: 'Fee %',
    account_limit: 'Account Limit',
    status: 'Status',
    created: 'Created',
    actions: 'Actions',
    username_col: 'Username',
    gender: 'Gender',
    phone: 'Phone',
    type: 'Type',
    amount: 'Amount',
    date: 'Date',
    client: 'Client',
    notes: 'Notes',

    // Buttons & Labels
    add_client: '+ Add Client',
    add_employee: '+ Add Employee',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    approve: 'Approve',
    reject: 'Reject',
    search_placeholder: 'Search...',
    loading: 'Loading...',
    no_data: 'No data found.',
    unlimited: 'Unlimited',

    // Client Management
    company_name: 'Company Name',
    initial_password: 'Initial Password',
    password_hint: 'Will be forced to change on first login',
    fee_percentage: 'Fee Percentage',
    active: 'Active',
    inactive: 'Inactive',
    add_client_title: 'Add Client',
    edit_client_title: 'Edit Client',
    save_client: 'Save Client',

    // Employee Management
    employee_name: 'Employee Name',
    add_employee_title: 'Add Employee',
    edit_employee_title: 'Edit Employee',
    save_employee: 'Save Employee',
    male: 'Male',
    female: 'Female',
    other: 'Other',

    // Reports
    export_pdf: 'Export PDF',
    export_excel: 'Export Excel',
    date_range: 'Date Range',
    last_7: 'Last 7 Days',
    last_30: 'Last 30 Days',
    last_90: 'Last 90 Days',
    custom: 'Custom Range',

    // Settings bar
    language: 'Language',
    theme: 'Theme',
    dark_mode: 'Dark Mode',
    light_mode: 'Light Mode',
  },

  hi: {
    // Navigation
    dashboard: 'डैशबोर्ड',
    txn_queue: 'लेनदेन क्यू',
    clients: 'ग्राहक',
    employees: 'कर्मचारी',
    bank_accounts: 'बैंक खाते',
    reports: 'रिपोर्ट',
    logout: 'लॉग आउट',

    // Auth
    welcome: 'CMS में आपका स्वागत है',
    login_subtitle: 'अपना कैश लेजर प्रबंधित करने के लिए लॉग इन करें',
    username_label: 'क्लाइंट कोड या उपयोगकर्ता नाम',
    password_label: 'पासवर्ड',
    sign_in: 'साइन इन करें',
    admin_login: 'एडमिन लॉगिन',
    employee_login: 'कर्मचारी लॉगिन',
    client_login: 'ग्राहक लॉगिन',
    admin_creds: 'अपना एडमिन विवरण दर्ज करें',
    employee_creds: 'अपना कर्मचारी विवरण दर्ज करें',
    client_creds: 'अपना क्लाइंट कोड दर्ज करें',
    admin_username: 'एडमिन उपयोगकर्ता नाम',
    employee_username: 'कर्मचारी उपयोगकर्ता नाम',
    client_code: 'क्लाइंट कोड',

    // Dashboard
    overview: 'अवलोकन',
    pending_txns: 'लंबित लेनदेन',
    total_clients: 'कुल ग्राहक',
    monthly_volume: 'मासिक भुगतान-इन',
    fees_collected: 'शुल्क संग्रहित',
    net_volume: 'शुद्ध मात्रा',
    pay_out: 'भुगतान-आउट',
    last_7_days: 'पिछले 7 दिन',
    pay_in: 'भुगतान इन',
    quick_actions: 'त्वरित क्रियाएं',
    new_pay_in: 'नया भुगतान इन',
    new_pay_out: 'भुगतान आउट अनुरोध',
    my_balance: 'मेरी शेष राशि',
    available_balance: 'उपलब्ध शेष',

    // Tables
    code: 'कोड',
    name: 'नाम',
    fee_pct: 'शुल्क %',
    account_limit: 'खाता सीमा',
    status: 'स्थिति',
    created: 'बनाया गया',
    actions: 'कार्रवाई',
    username_col: 'उपयोगकर्ता नाम',
    gender: 'लिंग',
    phone: 'फ़ोन',
    type: 'प्रकार',
    amount: 'राशि',
    date: 'दिनांक',
    client: 'ग्राहक',
    notes: 'नोट्स',

    // Buttons & Labels
    add_client: '+ ग्राहक जोड़ें',
    add_employee: '+ कर्मचारी जोड़ें',
    edit: 'संपादित करें',
    save: 'सहेजें',
    cancel: 'रद्द करें',
    approve: 'स्वीकृत करें',
    reject: 'अस्वीकार करें',
    search_placeholder: 'खोजें...',
    loading: 'लोड हो रहा है...',
    no_data: 'कोई डेटा नहीं मिला।',
    unlimited: 'असीमित',

    // Client Management
    company_name: 'कंपनी का नाम',
    initial_password: 'प्रारंभिक पासवर्ड',
    password_hint: 'पहले लॉगिन पर बदलना होगा',
    fee_percentage: 'शुल्क प्रतिशत',
    active: 'सक्रिय',
    inactive: 'निष्क्रिय',
    add_client_title: 'ग्राहक जोड़ें',
    edit_client_title: 'ग्राहक संपादित करें',
    save_client: 'ग्राहक सहेजें',

    // Employee Management
    employee_name: 'कर्मचारी का नाम',
    add_employee_title: 'कर्मचारी जोड़ें',
    edit_employee_title: 'कर्मचारी संपादित करें',
    save_employee: 'कर्मचारी सहेजें',
    male: 'पुरुष',
    female: 'महिला',
    other: 'अन्य',

    // Reports
    export_pdf: 'PDF निर्यात करें',
    export_excel: 'Excel निर्यात करें',
    date_range: 'दिनांक सीमा',
    last_7: 'पिछले 7 दिन',
    last_30: 'पिछले 30 दिन',
    last_90: 'पिछले 90 दिन',
    custom: 'कस्टम सीमा',

    // Settings bar
    language: 'भाषा',
    theme: 'थीम',
    dark_mode: 'डार्क मोड',
    light_mode: 'लाइट मोड',
  },

  mr: {
    // Navigation
    dashboard: 'डॅशबोर्ड',
    txn_queue: 'व्यवहार रांग',
    clients: 'ग्राहक',
    employees: 'कर्मचारी',
    bank_accounts: 'बँक खाती',
    reports: 'अहवाल',
    logout: 'लॉग आउट',

    // Auth
    welcome: 'CMS मध्ये आपले स्वागत आहे',
    login_subtitle: 'तुमचे कॅश लेजर व्यवस्थापित करण्यासाठी लॉग इन करा',
    username_label: 'क्लायंट कोड किंवा वापरकर्तानाव',
    password_label: 'पासवर्ड',
    sign_in: 'साइन इन करा',
    admin_login: 'अॅडमिन लॉगिन',
    employee_login: 'कर्मचारी लॉगिन',
    client_login: 'ग्राहक लॉगिन',
    admin_creds: 'तुमचे अॅडमिन तपशील प्रविष्ट करा',
    employee_creds: 'तुमचे कर्मचारी तपशील प्रविष्ट करा',
    client_creds: 'तुमचा क्लायंट कोड प्रविष्ट करा',
    admin_username: 'अॅडमिन वापरकर्तानाव',
    employee_username: 'कर्मचारी वापरकर्तानाव',
    client_code: 'क्लायंट कोड',

    // Dashboard
    overview: 'विहंगावलोकन',
    pending_txns: 'प्रलंबित व्यवहार',
    total_clients: 'एकूण ग्राहक',
    monthly_volume: 'मासिक पेमेंट-इन',
    fees_collected: 'शुल्क संकलित',
    net_volume: 'निव्वळ खंड',
    pay_out: 'पेमेंट-आउट',
    last_7_days: 'मागील 7 दिवस',
    pay_in: 'पेमेंट इन',
    quick_actions: 'द्रुत क्रिया',
    new_pay_in: 'नवीन पेमेंट इन',
    new_pay_out: 'पेमेंट आउट विनंती',
    my_balance: 'माझी शिल्लक',
    available_balance: 'उपलब्ध शिल्लक',

    // Tables
    code: 'कोड',
    name: 'नाव',
    fee_pct: 'शुल्क %',
    account_limit: 'खाते मर्यादा',
    status: 'स्थिती',
    created: 'तयार केले',
    actions: 'कृती',
    username_col: 'वापरकर्तानाव',
    gender: 'लिंग',
    phone: 'फोन',
    type: 'प्रकार',
    amount: 'रक्कम',
    date: 'तारीख',
    client: 'ग्राहक',
    notes: 'नोंदी',

    // Buttons & Labels
    add_client: '+ ग्राहक जोडा',
    add_employee: '+ कर्मचारी जोडा',
    edit: 'संपादित करा',
    save: 'जतन करा',
    cancel: 'रद्द करा',
    approve: 'मंजूर करा',
    reject: 'नाकारा',
    search_placeholder: 'शोधा...',
    loading: 'लोड होत आहे...',
    no_data: 'कोणताही डेटा आढळला नाही.',
    unlimited: 'असीमित',

    // Client Management
    company_name: 'कंपनीचे नाव',
    initial_password: 'प्रारंभिक पासवर्ड',
    password_hint: 'पहिल्या लॉगिनवर बदलणे आवश्यक',
    fee_percentage: 'शुल्क टक्केवारी',
    active: 'सक्रिय',
    inactive: 'निष्क्रिय',
    add_client_title: 'ग्राहक जोडा',
    edit_client_title: 'ग्राहक संपादित करा',
    save_client: 'ग्राहक जतन करा',

    // Employee Management
    employee_name: 'कर्मचाऱ्याचे नाव',
    add_employee_title: 'कर्मचारी जोडा',
    edit_employee_title: 'कर्मचारी संपादित करा',
    save_employee: 'कर्मचारी जतन करा',
    male: 'पुरुष',
    female: 'स्त्री',
    other: 'इतर',

    // Reports
    export_pdf: 'PDF निर्यात करा',
    export_excel: 'Excel निर्यात करा',
    date_range: 'तारीख श्रेणी',
    last_7: 'मागील 7 दिवस',
    last_30: 'मागील 30 दिवस',
    last_90: 'मागील 90 दिवस',
    custom: 'सानुकूल श्रेणी',

    // Settings bar
    language: 'भाषा',
    theme: 'थीम',
    dark_mode: 'डार्क मोड',
    light_mode: 'लाइट मोड',
  },
};

const SUPPORTED_LANGS = ['en', 'hi', 'mr'];
const LANG_KEY = 'cms_lang';

let _currentLang = localStorage.getItem(LANG_KEY) || 'en';
if (!SUPPORTED_LANGS.includes(_currentLang)) _currentLang = 'en';

/** Get a translated string by key */
export function t(key) {
  return TRANSLATIONS[_currentLang]?.[key] ?? TRANSLATIONS['en']?.[key] ?? key;
}

/** Get current language code */
export function getLang() { return _currentLang; }

/**
 * Set language and persist. Triggers a full DOM translation update.
 */
export function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  _currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.setAttribute('lang', lang);
  applyTranslations();
  // Dispatch event so pages can re-render dynamic content
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

/**
 * Auto-fill all elements with data-i18n="key" attribute.
 * Call after page renders.
 */
export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
      el.placeholder = val;
    } else {
      el.textContent = val;
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
}

/**
 * Build and return a language picker <select> element.
 */
export function buildLangPicker(className = '') {
  const select = document.createElement('select');
  select.className = `lang-picker form-select ${className}`;
  select.setAttribute('aria-label', 'Select Language');
  select.title = 'Language / भाषा / भाषा';
  const options = [
    { value: 'en', label: 'English' },
    { value: 'hi', label: 'हिंदी' },
    { value: 'mr', label: 'मराठी' },
  ];
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.value === _currentLang) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', e => setLang(e.target.value));
  return select;
}

// Apply on initial load
document.documentElement.setAttribute('lang', _currentLang);
