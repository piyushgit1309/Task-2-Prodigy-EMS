/**
 * Prodigy EMS - Client Side Application Logic
 * Full Stack Employee Management System
 */

// Global Application State
const App = {
  token: localStorage.getItem('prodigy_ems_token') || null,
  admin: null,
  employees: [],
  selectedIds: new Set(),
  pagination: {
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1
  },
  filters: {
    search: '',
    department: 'All',
    status: 'All',
    type: 'All',
    sortBy: 'created_at',
    sortOrder: 'desc'
  },
  hideSalary: true,
  viewMode: 'table', // 'table' or 'grid'
  charts: {
    dept: null,
    payroll: null,
    type: null
  },
  activeEmployeeToDelete: null,
  searchTimeout: null
};

// Department color themes
const DEPT_COLORS = {
  'Engineering': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'Product': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'Design': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  'Marketing': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'Human Resources': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Finance': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  'Sales': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  'Operations': { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' }
};

// Status color themes
const STATUS_COLORS = {
  'Active': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'On Leave': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  'Inactive': { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400' },
  'Terminated': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' }
};

// Initial DOM Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkAuthSession();
});

// ==========================================
// API CLIENT HELPER
// ==========================================
async function apiFetch(endpoint, options = {}) {
  const headers = options.headers || {};
  if (App.token) {
    headers['Authorization'] = `Bearer ${App.token}`;
  }
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  options.headers = headers;

  try {
    const res = await fetch(endpoint, options);
    if (res.status === 401) {
      // Session expired
      handleLogout(false);
      showToast('Session expired. Please log in again.', 'error');
      throw new Error('Unauthorized');
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'An unexpected error occurred.');
    }
    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

// ==========================================
// AUTHENTICATION WORKFLOWS
// ==========================================
async function checkAuthSession() {
  if (!App.token) {
    showAuthPortal();
    return;
  }
  try {
    const data = await apiFetch('/api/auth/me');
    App.admin = data.admin;
    renderAdminProfile();
    hideAuthPortal();
    loadDashboard();
  } catch (err) {
    handleLogout(false);
  }
}

function showAuthPortal() {
  document.getElementById('authPortal').classList.remove('hidden');
}

function hideAuthPortal() {
  document.getElementById('authPortal').classList.add('hidden');
}

function renderAdminProfile() {
  if (!App.admin) return;
  const name = App.admin.name || 'Admin';
  const email = App.admin.email || '';
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AD';

  document.getElementById('adminNameDisplay').textContent = name;
  document.getElementById('adminEmailDisplay').textContent = email;
  document.getElementById('adminAvatar').textContent = initials;
}

function handleLogout(notify = true) {
  if (App.token) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${App.token}` }
    }).catch(() => {});
  }
  App.token = null;
  App.admin = null;
  localStorage.removeItem('prodigy_ems_token');
  showAuthPortal();
  if (notify) showToast('Logged out successfully.', 'info');
}

// ==========================================
// DASHBOARD & ANALYTICS
// ==========================================
async function loadDashboard() {
  await Promise.all([
    fetchAnalytics(),
    fetchEmployees()
  ]);
}

async function fetchAnalytics() {
  try {
    const data = await apiFetch('/api/employees/analytics');
    
    // Update KPI Cards
    document.getElementById('statTotalEmployees').textContent = data.total_employees;
    document.getElementById('statActiveEmployees').textContent = data.active_count;
    document.getElementById('statTotalDepartments').textContent = data.departments.length;
    
    updatePayrollDisplay(data.total_payroll, data.avg_salary);

    // Render / Update Chart.js Insights
    renderCharts(data);
  } catch (err) {
    console.error('Failed to load analytics', err);
  }
}

function updatePayrollDisplay(total, avg) {
  const totalEl = document.getElementById('statTotalPayroll');
  const avgEl = document.getElementById('statAvgSalary');

  if (App.hideSalary) {
    totalEl.textContent = '₹ ••••••••';
    avgEl.textContent = 'Avg: ₹ •••••••• / yr';
  } else {
    totalEl.textContent = '₹ ' + Number(total).toLocaleString('en-IN');
    avgEl.textContent = 'Avg: ₹ ' + Math.round(avg).toLocaleString('en-IN') + ' / yr';
  }
}

function renderCharts(analytics) {
  const deptCtx = document.getElementById('deptChart')?.getContext('2d');
  const payrollCtx = document.getElementById('payrollChart')?.getContext('2d');
  const typeCtx = document.getElementById('typeChart')?.getContext('2d');

  if (!deptCtx || !analytics.departments) return;

  const deptLabels = analytics.departments.map(d => d.department);
  const deptCounts = analytics.departments.map(d => d.cnt);
  const deptSalaries = analytics.departments.map(d => d.total_salary);
  const palette = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#64748b'];

  // 1. Department Breakdown (Doughnut)
  if (App.charts.dept) App.charts.dept.destroy();
  App.charts.dept = new Chart(deptCtx, {
    type: 'doughnut',
    data: {
      labels: deptLabels,
      datasets: [{
        data: deptCounts,
        backgroundColor: palette.slice(0, deptLabels.length),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
      }
    }
  });

  // 2. Department Payroll Share (Bar)
  if (App.charts.payroll) App.charts.payroll.destroy();
  App.charts.payroll = new Chart(payrollCtx, {
    type: 'bar',
    data: {
      labels: deptLabels,
      datasets: [{
        label: 'Total Compensation (₹)',
        data: deptSalaries,
        backgroundColor: '#4f46e5',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 9 }, maxRotation: 45 } },
        y: { ticks: { callback: v => '₹' + (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v) } }
      }
    }
  });

  // 3. Contract Type (Polar Area / Doughnut)
  if (App.charts.type) App.charts.type.destroy();
  const typeLabels = analytics.employment_types.map(t => t.employment_type);
  const typeCounts = analytics.employment_types.map(t => t.cnt);

  App.charts.type = new Chart(typeCtx, {
    type: 'pie',
    data: {
      labels: typeLabels,
      datasets: [{
        data: typeCounts,
        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
      }
    }
  });
}

// ==========================================
// EMPLOYEE CRUD & LISTING
// ==========================================
async function fetchEmployees() {
  const { page, pageSize } = App.pagination;
  const { search, department, status, type, sortBy, sortOrder } = App.filters;

  const params = new URLSearchParams({
    page: page.toString(),
    page_size: pageSize.toString(),
    sort_by: sortBy,
    sort_order: sortOrder
  });

  if (search) params.append('search', search);
  if (department && department !== 'All') params.append('department', department);
  if (status && status !== 'All') params.append('status', status);
  if (type && type !== 'All') params.append('employment_type', type);

  try {
    const data = await apiFetch(`/api/employees?${params.toString()}`);
    App.employees = data.employees;
    App.pagination.total = data.total;
    App.pagination.totalPages = data.total_pages;

    renderEmployeesView();
    renderPagination();
    updateBulkActionBar();
  } catch (err) {
    showToast('Failed to fetch employee list: ' + err.message, 'error');
  }
}

function renderEmployeesView() {
  const tbody = document.getElementById('employeeTableBody');
  const grid = document.getElementById('gridViewWrapper');
  const empty = document.getElementById('emptyState');
  const tableWrapper = document.getElementById('tableViewWrapper');

  if (App.employees.length === 0) {
    tbody.innerHTML = '';
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    if (App.viewMode === 'table') {
      tableWrapper.classList.remove('hidden');
      grid.classList.add('hidden');
    } else {
      tableWrapper.classList.add('hidden');
      grid.classList.remove('hidden');
    }
    return;
  }

  empty.classList.add('hidden');

  if (App.viewMode === 'table') {
    tableWrapper.classList.remove('hidden');
    grid.classList.add('hidden');
    renderTableView(tbody);
  } else {
    tableWrapper.classList.add('hidden');
    grid.classList.remove('hidden');
    renderGridView(grid);
  }
}

function renderTableView(tbody) {
  tbody.innerHTML = App.employees.map(emp => {
    const deptStyle = DEPT_COLORS[emp.department] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
    const statusStyle = STATUS_COLORS[emp.status] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' };
    const isSelected = App.selectedIds.has(emp.id);
    const initials = (emp.first_name[0] + emp.last_name[0]).toUpperCase();
    
    const salaryDisplay = App.hideSalary
      ? '₹ ••••••••'
      : '₹ ' + Number(emp.salary).toLocaleString('en-IN');

    return `
      <tr class="table-row-hover ${isSelected ? 'bg-indigo-50/40' : ''}">
        <td class="py-3 px-4">
          <input type="checkbox" onchange="toggleSelectEmployee(${emp.id})" ${isSelected ? 'checked' : ''}
            class="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
        </td>
        <td class="py-3 px-4 font-mono font-bold text-slate-700 flex items-center gap-1.5">
          <span>${escapeHtml(emp.emp_id)}</span>
          <button onclick="copyToClipboard('${escapeHtml(emp.emp_id)}')" title="Copy ID" class="text-slate-400 hover:text-indigo-600 text-[10px]">
            <i class="fa-regular fa-copy"></i>
          </button>
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-2.5">
            <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0 shadow-xs">
              ${initials}
            </div>
            <div>
              <div class="font-bold text-slate-800 text-xs">${escapeHtml(emp.first_name)} ${escapeHtml(emp.last_name)}</div>
              <div class="text-[11px] text-slate-400">${escapeHtml(emp.email)}</div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          <span class="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold border ${deptStyle.bg} ${deptStyle.text} ${deptStyle.border}">
            ${escapeHtml(emp.department)}
          </span>
          <div class="text-[11px] text-slate-500 mt-0.5 font-medium">${escapeHtml(emp.job_title)}</div>
        </td>
        <td class="py-3 px-4 text-slate-600 font-medium">${escapeHtml(emp.employment_type)}</td>
        <td class="py-3 px-4 text-slate-600 font-mono text-[11px]">${escapeHtml(emp.joining_date)}</td>
        <td class="py-3 px-4 font-bold text-slate-800">${salaryDisplay}</td>
        <td class="py-3 px-4">
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}">
            <span class="w-1.5 h-1.5 rounded-full ${statusStyle.dot}"></span>
            ${escapeHtml(emp.status)}
          </span>
        </td>
        <td class="py-3 px-4 text-right whitespace-nowrap">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="viewEmployeeModal(${emp.id})" title="View Details"
              class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 transition-colors flex items-center justify-center">
              <i class="fa-regular fa-eye"></i>
            </button>
            <button onclick="openEditEmployeeModal(${emp.id})" title="Edit Employee"
              class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-600 transition-colors flex items-center justify-center">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="openDeleteModal(${emp.id})" title="Delete Employee"
              class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition-colors flex items-center justify-center">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderGridView(grid) {
  grid.innerHTML = App.employees.map(emp => {
    const deptStyle = DEPT_COLORS[emp.department] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
    const statusStyle = STATUS_COLORS[emp.status] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' };
    const initials = (emp.first_name[0] + emp.last_name[0]).toUpperCase();
    const salaryDisplay = App.hideSalary ? '₹ ••••••••' : '₹ ' + Number(emp.salary).toLocaleString('en-IN');

    return `
      <div class="glass-card bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
              ${initials}
            </div>
            <div>
              <h4 class="font-bold text-slate-800 text-sm leading-tight">${escapeHtml(emp.first_name)} ${escapeHtml(emp.last_name)}</h4>
              <p class="text-[11px] text-slate-500">${escapeHtml(emp.job_title)}</p>
              <span class="font-mono text-[10px] text-indigo-600 font-semibold">${escapeHtml(emp.emp_id)}</span>
            </div>
          </div>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}">
            <span class="w-1.5 h-1.5 rounded-full ${statusStyle.dot}"></span>
            ${escapeHtml(emp.status)}
          </span>
        </div>

        <div class="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-[11px]">Department:</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold border ${deptStyle.bg} ${deptStyle.text} ${deptStyle.border}">
              ${escapeHtml(emp.department)}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-[11px]">Email:</span>
            <span class="text-indigo-600 truncate max-w-[150px] font-medium">${escapeHtml(emp.email)}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-400 text-[11px]">Salary:</span>
            <span class="font-bold text-slate-800">${salaryDisplay}</span>
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-1.5">
          <button onclick="viewEmployeeModal(${emp.id})" class="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-lg transition-colors flex items-center gap-1">
            <i class="fa-regular fa-eye"></i> View
          </button>
          <button onclick="openEditEmployeeModal(${emp.id})" class="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-600 rounded-lg transition-colors flex items-center gap-1">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
          <button onclick="openDeleteModal(${emp.id})" class="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 rounded-lg transition-colors flex items-center gap-1">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderPagination() {
  const { page, total, totalPages, pageSize } = App.pagination;
  const summaryEl = document.getElementById('paginationSummary');
  const buttonsEl = document.getElementById('paginationButtons');

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  summaryEl.textContent = `Showing ${start} to ${end} of ${total} records`;

  let btns = '';
  // Prev button
  btns += `
    <button onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}
      class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">
      <i class="fa-solid fa-chevron-left text-[10px]"></i>
    </button>
  `;

  // Page Numbers
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
      btns += `
        <button onclick="goToPage(${p})"
          class="px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
            p === page
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }">
          ${p}
        </button>
      `;
    } else if (p === page - 2 || p === page + 2) {
      btns += `<span class="px-1 text-slate-400">...</span>`;
    }
  }

  // Next button
  btns += `
    <button onclick="goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}
      class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors">
      <i class="fa-solid fa-chevron-right text-[10px]"></i>
    </button>
  `;

  buttonsEl.innerHTML = btns;
}

function goToPage(newPage) {
  if (newPage < 1 || newPage > App.pagination.totalPages) return;
  App.pagination.page = newPage;
  fetchEmployees();
}

// ==========================================
// SELECTION & BULK ACTIONS
// ==========================================
function toggleSelectEmployee(id) {
  if (App.selectedIds.has(id)) {
    App.selectedIds.delete(id);
  } else {
    App.selectedIds.add(id);
  }
  updateBulkActionBar();
  renderEmployeesView();
}

function updateBulkActionBar() {
  const bar = document.getElementById('bulkActionBar');
  const countSpan = document.getElementById('bulkSelectedCount');
  const selectAll = document.getElementById('selectAllCheckbox');

  const count = App.selectedIds.size;
  if (count > 0) {
    bar.classList.remove('hidden');
    countSpan.textContent = `${count} employee${count > 1 ? 's' : ''} selected`;
  } else {
    bar.classList.add('hidden');
  }

  if (selectAll && App.employees.length > 0) {
    selectAll.checked = App.employees.every(e => App.selectedIds.has(e.id));
  }
}

// ==========================================
// MODALS: ADD, EDIT, VIEW, DELETE
// ==========================================
function openAddEmployeeModal() {
  document.getElementById('employeeModalTitle').textContent = 'Add New Employee';
  document.getElementById('saveBtnText').textContent = 'Save Employee';
  document.getElementById('formEmployeeDbId').value = '';
  document.getElementById('formEmpId').disabled = false;
  document.getElementById('employeeForm').reset();

  // Set default date to today
  document.getElementById('formJoiningDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('employeeModal').classList.remove('hidden');
}

function openEditEmployeeModal(id) {
  const emp = App.employees.find(e => e.id === id);
  if (!emp) return;

  document.getElementById('employeeModalTitle').textContent = `Edit Employee (${emp.emp_id})`;
  document.getElementById('saveBtnText').textContent = 'Update Employee';
  document.getElementById('formEmployeeDbId').value = emp.id;

  // Disable changing emp_id on update
  const empIdInput = document.getElementById('formEmpId');
  empIdInput.value = emp.emp_id;
  empIdInput.disabled = true;

  document.getElementById('formFirstName').value = emp.first_name;
  document.getElementById('formLastName').value = emp.last_name;
  document.getElementById('formEmail').value = emp.email;
  document.getElementById('formPhone').value = emp.phone;
  document.getElementById('formDepartment').value = emp.department;
  document.getElementById('formJobTitle').value = emp.job_title;
  document.getElementById('formEmploymentType').value = emp.employment_type;
  document.getElementById('formJoiningDate').value = emp.joining_date;
  document.getElementById('formSalary').value = emp.salary;
  document.getElementById('formStatus').value = emp.status;
  document.getElementById('formAddress').value = emp.address || '';
  document.getElementById('formEmergencyContact').value = emp.emergency_contact || '';

  document.getElementById('employeeModal').classList.remove('hidden');
}

function closeEmployeeModal() {
  document.getElementById('employeeModal').classList.add('hidden');
}

async function handleEmployeeFormSubmit(e) {
  e.preventDefault();
  const dbId = document.getElementById('formEmployeeDbId').value;
  const isEdit = !!dbId;

  const payload = {
    first_name: document.getElementById('formFirstName').value.trim(),
    last_name: document.getElementById('formLastName').value.trim(),
    email: document.getElementById('formEmail').value.trim().toLowerCase(),
    phone: document.getElementById('formPhone').value.trim(),
    department: document.getElementById('formDepartment').value,
    job_title: document.getElementById('formJobTitle').value.trim(),
    employment_type: document.getElementById('formEmploymentType').value,
    joining_date: document.getElementById('formJoiningDate').value,
    salary: parseFloat(document.getElementById('formSalary').value),
    status: document.getElementById('formStatus').value,
    address: document.getElementById('formAddress').value.trim(),
    emergency_contact: document.getElementById('formEmergencyContact').value.trim()
  };

  if (!isEdit) {
    payload.emp_id = document.getElementById('formEmpId').value.trim().toUpperCase();
  }

  // Client validations
  if (isNaN(payload.salary) || payload.salary <= 0) {
    showToast('Please enter a valid positive salary amount.', 'error');
    return;
  }

  const saveBtn = document.getElementById('saveEmployeeBtn');
  const originalHtml = saveBtn.innerHTML;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    if (isEdit) {
      await apiFetch(`/api/employees/${dbId}`, { method: 'PUT', body: payload });
      showToast('Employee record updated successfully.', 'success');
    } else {
      await apiFetch('/api/employees', { method: 'POST', body: payload });
      showToast('New employee created successfully.', 'success');
    }

    closeEmployeeModal();
    await Promise.all([fetchEmployees(), fetchAnalytics()]);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalHtml;
  }
}

async function viewEmployeeModal(id) {
  try {
    const emp = await apiFetch(`/api/employees/${id}`);
    const initials = (emp.first_name[0] + emp.last_name[0]).toUpperCase();

    document.getElementById('viewAvatar').textContent = initials;
    document.getElementById('viewFullName').textContent = `${emp.first_name} ${emp.last_name}`;
    document.getElementById('viewJobTitle').textContent = emp.job_title;
    document.getElementById('viewEmpId').textContent = emp.emp_id;
    document.getElementById('viewDepartment').textContent = emp.department;
    document.getElementById('viewEmploymentType').textContent = emp.employment_type;
    
    const emailLink = document.getElementById('viewEmail');
    emailLink.textContent = emp.email;
    emailLink.href = `mailto:${emp.email}`;

    document.getElementById('viewPhone').textContent = emp.phone;
    document.getElementById('viewJoiningDate').textContent = emp.joining_date;

    // Calculate tenure
    const joinDate = new Date(emp.joining_date);
    const diffMonths = Math.max(0, Math.floor((new Date() - joinDate) / (1000 * 60 * 60 * 24 * 30.4)));
    const yrs = Math.floor(diffMonths / 12);
    const mos = diffMonths % 12;
    let tenureText = '';
    if (yrs > 0) tenureText += `${yrs} yr${yrs > 1 ? 's' : ''} `;
    tenureText += `${mos} mo${mos > 1 ? 's' : ''}`;
    document.getElementById('viewTenure').textContent = `(${tenureText})`;

    document.getElementById('viewSalary').textContent = '₹ ' + Number(emp.salary).toLocaleString('en-IN');
    document.getElementById('viewEmergencyContact').textContent = emp.emergency_contact || 'None specified';
    document.getElementById('viewAddress').textContent = emp.address || 'None specified';

    const statusBadge = document.getElementById('viewStatusBadge');
    statusBadge.textContent = emp.status;
    const statusStyle = STATUS_COLORS[emp.status] || { dot: 'bg-emerald-500' };
    statusBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white ${statusStyle.dot}`;

    // Edit button inside view modal
    document.getElementById('viewEditBtn').onclick = () => {
      document.getElementById('viewModal').classList.add('hidden');
      openEditEmployeeModal(emp.id);
    };

    document.getElementById('viewModal').classList.remove('hidden');
  } catch (err) {
    showToast('Failed to view profile: ' + err.message, 'error');
  }
}

function openDeleteModal(id) {
  const emp = App.employees.find(e => e.id === id);
  if (!emp) return;

  App.activeEmployeeToDelete = emp;
  document.getElementById('deleteEmpName').textContent = `${emp.first_name} ${emp.last_name}`;
  document.getElementById('deleteEmpCode').textContent = emp.emp_id;
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
  App.activeEmployeeToDelete = null;
  document.getElementById('deleteModal').classList.add('hidden');
}

async function handleConfirmDelete() {
  if (!App.activeEmployeeToDelete) return;
  const emp = App.activeEmployeeToDelete;

  try {
    await apiFetch(`/api/employees/${emp.id}`, { method: 'DELETE' });
    showToast(`Employee ${emp.first_name} ${emp.last_name} deleted.`, 'info');
    App.selectedIds.delete(emp.id);
    closeDeleteModal();
    await Promise.all([fetchEmployees(), fetchAnalytics()]);
  } catch (err) {
    showToast('Failed to delete: ' + err.message, 'error');
  }
}

async function handleBulkDelete() {
  const ids = Array.from(App.selectedIds);
  if (ids.length === 0) return;

  if (!confirm(`Are you sure you want to delete ${ids.length} selected employee records?`)) return;

  try {
    await apiFetch('/api/employees/bulk-delete', { method: 'POST', body: ids });
    showToast(`Successfully deleted ${ids.length} employee records.`, 'success');
    App.selectedIds.clear();
    await Promise.all([fetchEmployees(), fetchAnalytics()]);
  } catch (err) {
    showToast('Failed to bulk delete: ' + err.message, 'error');
  }
}

// ==========================================
// TOAST NOTIFICATION SYSTEM
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');

  const configs = {
    success: { icon: 'fa-circle-check', bg: 'bg-emerald-600', text: 'text-white' },
    error: { icon: 'fa-circle-xmark', bg: 'bg-rose-600', text: 'text-white' },
    info: { icon: 'fa-circle-info', bg: 'bg-indigo-600', text: 'text-white' },
    warning: { icon: 'fa-triangle-exclamation', bg: 'bg-amber-600', text: 'text-white' }
  };
  const cfg = configs[type] || configs.info;

  toast.className = `${cfg.bg} ${cfg.text} px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-xs font-semibold animate-slide-in pointer-events-auto max-w-md`;
  toast.innerHTML = `
    <i class="fa-solid ${cfg.icon} text-base flex-shrink-0"></i>
    <span class="flex-1">${escapeHtml(message)}</span>
    <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white ml-2">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================
// EVENT LISTENERS & WIRING
// ==========================================
function setupEventListeners() {
  // Auth Form Tabs
  const tabLogin = document.getElementById('tabLoginBtn');
  const tabRegister = document.getElementById('tabRegisterBtn');
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');

  tabLogin.onclick = () => {
    tabLogin.className = 'flex-1 py-3 text-indigo-600 border-b-2 border-indigo-600 focus:outline-none transition-colors';
    tabRegister.className = 'flex-1 py-3 text-slate-500 hover:text-slate-800 border-b-2 border-transparent focus:outline-none transition-colors';
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
  };

  tabRegister.onclick = () => {
    tabRegister.className = 'flex-1 py-3 text-purple-600 border-b-2 border-purple-600 focus:outline-none transition-colors';
    tabLogin.className = 'flex-1 py-3 text-slate-500 hover:text-slate-800 border-b-2 border-transparent focus:outline-none transition-colors';
    regForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  };

  // Demo Credentials Fill
  document.getElementById('fillDemoBtn').onclick = () => {
    document.getElementById('loginEmail').value = 'admin@prodigy.com';
    document.getElementById('loginPassword').value = 'admin123';
    showToast('Demo admin credentials filled!', 'info');
  };

  // Password toggles
  document.getElementById('toggleLoginPasswordBtn').onclick = function() {
    togglePasswordVisibility('loginPassword', this);
  };
  document.getElementById('toggleRegPasswordBtn').onclick = function() {
    togglePasswordVisibility('regPassword', this);
  };

  // Login Submit
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const btn = document.getElementById('loginSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in...';

    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      });
      App.token = data.token;
      App.admin = data.admin;
      localStorage.setItem('prodigy_ems_token', data.token);

      hideAuthPortal();
      renderAdminProfile();
      showToast(`Welcome back, ${data.admin.name}!`, 'success');
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Sign In to Dashboard</span> <i class="fa-solid fa-arrow-right text-xs"></i>';
    }
  };

  // Register Submit
  regForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    const btn = document.getElementById('regSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registering...';

    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: { name, email, password }
      });
      showToast('Admin account created! Please sign in.', 'success');
      tabLogin.click();
      document.getElementById('loginEmail').value = email;
      document.getElementById('loginPassword').value = password;
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>Register Admin Account</span> <i class="fa-solid fa-user-check text-xs"></i>';
    }
  };

  // Logout
  document.getElementById('logoutBtn').onclick = () => handleLogout(true);

  // Analytics Toggle
  const toggleAnalyticsBtn = document.getElementById('toggleAnalyticsBtn');
  const analyticsSec = document.getElementById('analyticsSection');
  const analyticsToggleText = document.getElementById('analyticsToggleText');
  const closeAnalyticsBtn = document.getElementById('closeAnalyticsBtn');

  const toggleAnalytics = () => {
    const isHidden = analyticsSec.classList.contains('hidden');
    if (isHidden) {
      analyticsSec.classList.remove('hidden');
      analyticsToggleText.textContent = 'Hide Visual Analytics';
    } else {
      analyticsSec.classList.add('hidden');
      analyticsToggleText.textContent = 'Show Visual Analytics';
    }
  };
  toggleAnalyticsBtn.onclick = toggleAnalytics;
  closeAnalyticsBtn.onclick = toggleAnalytics;

  // Privacy Toggle for Salary
  document.getElementById('toggleSalaryPrivacyBtn').onclick = () => {
    App.hideSalary = !App.hideSalary;
    const icon = document.getElementById('salaryPrivacyIcon');
    if (App.hideSalary) {
      icon.className = 'fa-regular fa-eye-slash';
    } else {
      icon.className = 'fa-regular fa-eye';
    }
    fetchAnalytics();
    renderEmployeesView();
  };

  // Search Input with Debounce
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  searchInput.oninput = (e) => {
    const val = e.target.value;
    clearSearchBtn.classList.toggle('hidden', !val);
    clearTimeout(App.searchTimeout);
    App.searchTimeout = setTimeout(() => {
      App.filters.search = val;
      App.pagination.page = 1;
      fetchEmployees();
    }, 300);
  };

  clearSearchBtn.onclick = () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    App.filters.search = '';
    App.pagination.page = 1;
    fetchEmployees();
  };

  // Filter Dropdowns
  document.getElementById('filterDepartment').onchange = (e) => {
    App.filters.department = e.target.value;
    App.pagination.page = 1;
    fetchEmployees();
  };

  document.getElementById('filterStatus').onchange = (e) => {
    App.filters.status = e.target.value;
    App.pagination.page = 1;
    fetchEmployees();
  };

  document.getElementById('filterType').onchange = (e) => {
    App.filters.type = e.target.value;
    App.pagination.page = 1;
    fetchEmployees();
  };

  document.getElementById('sortBy').onchange = (e) => {
    App.filters.sortBy = e.target.value;
    fetchEmployees();
  };

  // Sort Order
  document.getElementById('toggleSortOrderBtn').onclick = () => {
    App.filters.sortOrder = App.filters.sortOrder === 'asc' ? 'desc' : 'asc';
    const icon = document.getElementById('sortOrderIcon');
    icon.className = App.filters.sortOrder === 'asc' ? 'fa-solid fa-arrow-up-short-wide' : 'fa-solid fa-arrow-down-short-wide';
    fetchEmployees();
  };

  // View Mode Switcher
  const viewTableBtn = document.getElementById('viewTableBtn');
  const viewGridBtn = document.getElementById('viewGridBtn');

  viewTableBtn.onclick = () => {
    App.viewMode = 'table';
    viewTableBtn.className = 'px-2.5 py-1.5 rounded-lg bg-white shadow-xs text-indigo-600 font-semibold';
    viewGridBtn.className = 'px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 font-semibold';
    renderEmployeesView();
  };

  viewGridBtn.onclick = () => {
    App.viewMode = 'grid';
    viewGridBtn.className = 'px-2.5 py-1.5 rounded-lg bg-white shadow-xs text-indigo-600 font-semibold';
    viewTableBtn.className = 'px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 font-semibold';
    renderEmployeesView();
  };

  // Reset Filters
  document.getElementById('resetFiltersBtn').onclick = resetAllFilters;

  // Select All Checkbox
  document.getElementById('selectAllCheckbox').onchange = (e) => {
    if (e.target.checked) {
      App.employees.forEach(emp => App.selectedIds.add(emp.id));
    } else {
      App.employees.forEach(emp => App.selectedIds.delete(emp.id));
    }
    updateBulkActionBar();
    renderEmployeesView();
  };

  // Bulk Delete
  document.getElementById('bulkDeleteBtn').onclick = handleBulkDelete;

  // Page Size Select
  document.getElementById('pageSizeSelect').onchange = (e) => {
    App.pagination.pageSize = parseInt(e.target.value, 10);
    App.pagination.page = 1;
    fetchEmployees();
  };

  // Modals Wiring
  document.getElementById('openAddModalBtn').onclick = openAddEmployeeModal;
  document.getElementById('closeEmployeeModalBtn').onclick = closeEmployeeModal;
  document.getElementById('cancelEmployeeModalBtn').onclick = closeEmployeeModal;
  document.getElementById('employeeForm').onsubmit = handleEmployeeFormSubmit;

  document.getElementById('closeViewModalBtn').onclick = () => {
    document.getElementById('viewModal').classList.add('hidden');
  };

  document.getElementById('cancelDeleteBtn').onclick = closeDeleteModal;
  document.getElementById('confirmDeleteBtn').onclick = handleConfirmDelete;

  // Export CSV
  document.getElementById('exportCsvBtn').onclick = async () => {
    try {
      showToast('Preparing CSV file...', 'info');
      const res = await fetch('/api/employees/export/csv', {
        headers: { 'Authorization': `Bearer ${App.token}` }
      });
      if (!res.ok) throw new Error('Export failed.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `employees_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast('CSV downloaded successfully!', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Keyboard Shortcuts: Esc to close modals, Ctrl/Cmd + N to add employee
  window.onkeydown = (e) => {
    if (e.key === 'Escape') {
      closeEmployeeModal();
      document.getElementById('viewModal').classList.add('hidden');
      closeDeleteModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && App.token) {
      e.preventDefault();
      openAddEmployeeModal();
    }
  };
}

function resetAllFilters() {
  App.filters.search = '';
  App.filters.department = 'All';
  App.filters.status = 'All';
  App.filters.type = 'All';
  App.filters.sortBy = 'created_at';
  App.filters.sortOrder = 'desc';

  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearchBtn').classList.add('hidden');
  document.getElementById('filterDepartment').value = 'All';
  document.getElementById('filterStatus').value = 'All';
  document.getElementById('filterType').value = 'All';
  document.getElementById('sortBy').value = 'created_at';
  document.getElementById('sortOrderIcon').className = 'fa-solid fa-arrow-down-short-wide';

  App.pagination.page = 1;
  fetchEmployees();
  showToast('Filters reset to default.', 'info');
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Copied "${text}" to clipboard!`, 'info');
  }).catch(() => {});
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
