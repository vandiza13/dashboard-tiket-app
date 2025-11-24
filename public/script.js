// Konstanta dan Variabel Global
const API_URL_TICKETS = `/api/tickets`;
const API_URL_TECHNICIANS = `/api/technicians`;

let addTicketModal, updateTicketModal, reportModal, techniciansModal, editTechnicianModal, historyModal;
let ticketsCache = [], activeTechniciansCache = [];
let currentCategoryFilter = 'Semua';
let currentEditingTicket = null;
let currentView = 'running';
const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` };

const categories = {
    SQUAT: ["TSEL", "OLO"],
    MTEL: ["FIBERISASI", "TIS", "MMP"],
    UMT: ["UMT"],
    CENTRATAMA: ["FSI"]
};

let filteredTicketsCache = [];
let currentPage = 1;
const PAGE_SIZE = 20;
let backendTotalPages = 1;
let allClosedTicketsCache = [];
let statsTrendChart = null;
let subcategoryChart = null;
let statusChart = null;

// --- FUNGSI SIDEBAR ---

function isMobile() {
    return window.innerWidth <= 991;
}

function showSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (isMobile()) {
        sidebar.classList.add('show');
        overlay.style.display = 'block';
    } else {
        sidebar.classList.toggle('collapsed');
        document.getElementById('main-content').classList.toggle('sidebar-collapsed');
        
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    }
}

function hideSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    sidebar.classList.remove('show');
    overlay.style.display = 'none';
}

function loadSidebarState() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content');
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    
    if (!isMobile() && isCollapsed) {
        sidebar.classList.add('collapsed');
        mainContent.classList.add('sidebar-collapsed');
    }
}

// Inisialisasi Aplikasi
document.addEventListener('DOMContentLoaded', () => {
    addTicketModal = new bootstrap.Modal(document.getElementById('addTicketModal'));
    updateTicketModal = new bootstrap.Modal(document.getElementById('updateTicketModal'));
    reportModal = new bootstrap.Modal(document.getElementById('reportModal'));
    techniciansModal = new bootstrap.Modal(document.getElementById('techniciansModal'));
    editTechnicianModal = new bootstrap.Modal(document.getElementById('editTechnicianModal'));
    historyModal = new bootstrap.Modal(document.getElementById('historyModal'));
    
    document.getElementById('sidebar-toggle').addEventListener('click', showSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', hideSidebar);
    
    document.getElementById('addTechnicianForm').addEventListener('submit', handleAddTechnician);
    document.getElementById('save-edit-tech-btn').addEventListener('click', handleEditTechnicianSubmit);
    document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
    document.getElementById('category').addEventListener('change', updateSubcategoryOptions);
    document.getElementById('update_category').addEventListener('change', updateSubcategoryOptions);

    window.addEventListener('resize', () => {
        if (!isMobile()) {
            hideSidebar();
        }
    });

    document.querySelectorAll('#sidebar .nav-link').forEach(link => {
        link.addEventListener('click', () => {
            if (isMobile()) hideSidebar();
        });
    });

    loadSidebarState();
    applyRoles();
    fetchActiveTechnicians();
    router(); 
});

window.addEventListener('hashchange', router);

// --- FUNGSI UTAMA & NAVIGASI ---

function applyRoles() { 
  const userRole = localStorage.getItem('userRole');
  if (userRole === 'View') { 
    document.getElementById('add-ticket-btn').style.display = 'none'; 
  }
  // --- TAMBAHKAN INI ---
  if (userRole === 'Admin') {
    document.getElementById('nav-users-li').style.display = 'block';
  }
  // ---------------------
}

async function router() {
    const hash = window.location.hash || '#running';
    const pageTitle = document.getElementById('page-title');
    const contentArea = document.getElementById('content-area');
    const mainActions = document.getElementById('main-actions');
    const dateFilterContainer = document.getElementById('date-filter-container');
    const exportBtn = document.getElementById('export-btn');
    const statsSummaryContainer = document.getElementById('stats-summary-container');
    if (statsSummaryContainer) statsSummaryContainer.style.display = 'none';

    document.querySelectorAll('#sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === hash) link.classList.add('active');
    });

    mainActions.style.display = 'flex'; 
    dateFilterContainer.style.display = 'none';
    if(exportBtn) exportBtn.style.display = 'none';

    switch (hash) {
        case '#running':
            currentView = 'running';
            pageTitle.innerText = 'Tiket Running';
            contentArea.innerHTML = createTicketTableHTML();
            dateFilterContainer.style.display = 'flex'; 
            await fetchAndRenderTickets('running');
            break;
        case '#closed':
            currentView = 'closed';
            pageTitle.innerText = 'Tiket Closed';
            contentArea.innerHTML = createTicketTableHTML();
            dateFilterContainer.style.display = 'flex';
            if(exportBtn) exportBtn.style.display = 'block';
            const tbody = document.getElementById('ticket-table-body');
            tbody.innerHTML = `<tr><td colspan="11" class="text-center">Memuat data dan indeks pencarian...</td></tr>`;
            const [ticketsData] = await Promise.all([
                fetchAndRenderTickets('closed'),
                fetchAllClosedTicketsForSearch()
            ]);
            applyFiltersAndRender(1, true); 
            break;
        case '#stats':
            pageTitle.innerText = 'Statistik';
            mainActions.style.display = 'none';
            if (statsSummaryContainer) statsSummaryContainer.style.display = 'block';
            await fetchAndRenderStats();
            break;
        case '#profile':
            pageTitle.innerText = 'Profil Pengguna';
            mainActions.style.display = 'none';
            await fetchAndRenderProfile();
            break;
        default:
            window.location.hash = '#running';
    }
}

async function fetchAllClosedTicketsForSearch() {
    let url = `${API_URL_TICKETS}/closed?page=1&limit=10000`;
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    if (startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    try {
        const response = await fetch(url, { headers: authHeaders });
        const data = await response.json();
        if (data && Array.isArray(data.tickets)) {
            allClosedTicketsCache = data.tickets;
        } else {
            allClosedTicketsCache = [];
        }
    } catch (e) {
        allClosedTicketsCache = [];
    }
}

function createTicketTableHTML() {
    return `
        <ul class="nav nav-tabs category-tabs mb-3">
          <li class="nav-item"><a class="nav-link active" onclick="filterByCategory('Semua', this)">Semua</a></li>
          <li class="nav-item"><a class="nav-link" onclick="filterByCategory('SQUAT', this)">SQUAT</a></li>
          <li class="nav-item"><a class="nav-link" onclick="filterByCategory('MTEL', this)">MTEL</a></li>
          <li class="nav-item"><a class="nav-link" onclick="filterByCategory('UMT', this)">UMT</a></li>
          <li class="nav-item"><a class="nav-link" onclick="filterByCategory('CENTRATAMA', this)">CENTRATAMA</a></li>
        </ul>
        <div class="mb-3"><input type="search" id="searchInput" class="form-control" placeholder="🔍 Cari di dalam tab ini..." oninput="applyFiltersAndRender()"></div>
        <div class="table-responsive"><table class="table"><thead class="table-dark"><tr><th>No.</th><th>ID Tiket</th><th>Jenis Tiket</th><th>Waktu Tiket</th><th>Update Terakhir</th><th>Deskripsi</th><th>Status</th><th>Teknisi</th><th>Update Progres</th><th>Updated By</th><th>Aksi</th></tr></thead><tbody id="ticket-table-body"></tbody></table></div>
        <nav id="pagination-container" class="mt-3"></nav>
    `;
}

// --- FUNGSI PENGAMBILAN DATA (FETCH) ---

async function fetchAndRenderTickets(type, page = 1) {
    const tbody = document.getElementById('ticket-table-body');
    const paginationContainer = document.getElementById('pagination-container');
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    
    let url = `${API_URL_TICKETS}/${type}?page=${page}&limit=20`;
    if (startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
    }

    tbody.innerHTML = `<tr><td colspan="11" class="text-center">Memuat data...</td></tr>`;
    if (paginationContainer) paginationContainer.innerHTML = '';

    try {
        const response = await fetch(url, { headers: authHeaders });
        if (response.status === 401 || response.status === 403) { logout(); return; }
        
        const data = await response.json();
        
        if (data && Array.isArray(data.tickets)) {
            ticketsCache = data.tickets;
            backendTotalPages = data.totalPages || 1;
            currentPage = data.currentPage || 1;
            currentCategoryFilter = 'Semua';
            const categoryTabs = document.querySelector('.category-tabs');
            if (categoryTabs) {
                categoryTabs.querySelectorAll('.nav-link').forEach(tab => tab.classList.remove('active'));
                categoryTabs.querySelector('.nav-link').classList.add('active');
            }
            applyFiltersAndRender(currentPage, true);
        } else { throw new Error(data.error || 'Format data salah.'); }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger">Gagal memuat data.</td></tr>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
    }
}

async function fetchAndRenderProfile() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `<p>Memuat data profil...</p>`;
    try {
        const response = await fetch(`/api/profile`, { headers: authHeaders });
        if (response.status === 401 || response.status === 403) { logout(); return; }
        const user = await response.json();
        contentArea.innerHTML = `<div class="row"><div class="col-md-6"><div class="card"><div class="card-header">Detail Akun</div><div class="card-body"><p><strong>Username:</strong> ${user.username}</p><p><strong>Peran (Role):</strong> ${user.role}</p><p><strong>Tanggal Bergabung:</strong> ${formatDateTimeWIB(user.created_at)}</p></div></div></div><div class="col-md-6 mt-3 mt-md-0"><div class="card"><div class="card-header">Ganti Password</div><div class="card-body"><form id="changePasswordForm"><div class="mb-3"><label for="currentPassword" class="form-label">Password Saat Ini</label><input type="password" class="form-control" id="currentPassword" required></div><div class="mb-3"><label for="newPassword" class="form-label">Password Baru</label><input type="password" class="form-control" id="newPassword" required></div><div class="mb-3"><label for="confirmPassword" class="form-label">Konfirmasi Password Baru</label><input type="password" class="form-control" id="confirmPassword" required></div><button type="submit" class="btn btn-primary">Simpan Password</button></form><div id="password-message" class="mt-3"></div></div></div></div></div>`;
        document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);
    } catch (error) { contentArea.innerHTML = `<p class="text-danger">Gagal memuat data profil.</p>`; }
}

async function fetchAndRenderStats() {
    const contentArea = document.getElementById('content-area');
    const statsSummaryRow = document.getElementById('stats-summary-row');
    const statsChartLoading = document.getElementById('stats-chart-loading');
    contentArea.innerHTML = '';
    if (statsSummaryRow) statsSummaryRow.innerHTML = '';
    if (statsChartLoading) statsChartLoading.style.display = 'inline';

    try {
        const response = await fetch(`/api/stats?ts=${Date.now()}`, { headers: authHeaders });
        if (!response.ok) throw new Error('Gagal mengambil data statistik');
        const stats = await response.json();
        if (!stats.runningDetails || !stats.closedTodayDetails || !stats.statusDistribution || !stats.categoryDistribution || !stats.closedThisMonth || !stats.subcategoryDistribution) {
            throw new Error('Format data statistik tidak sesuai.');
        }

        if (statsSummaryRow) {
            statsSummaryRow.innerHTML = `
                <div class="col-md-3 col-6">
                    <div class="stats-summary-card bg-gradient-primary">
                        <span class="icon"><i class="bi bi-lightning-charge"></i></span>
                        <div>
                            <div class="stat-value">${stats.runningDetails.total}</div>
                            <div class="stat-label">Tiket Running</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="stats-summary-card bg-gradient-success">
                        <span class="icon"><i class="bi bi-check-circle"></i></span>
                        <div>
                            <div class="stat-value">${stats.closedTodayDetails.total}</div>
                            <div class="stat-label">Closed Hari Ini</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="stats-summary-card bg-gradient-info">
                        <span class="icon"><i class="bi bi-calendar3"></i></span>
                        <div>
                            <div class="stat-value">${stats.closedThisMonth}</div>
                            <div class="stat-label">Closed Bulan Ini</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-3 col-6">
                    <div class="stats-summary-card bg-gradient-secondary">
                        <span class="icon"><i class="bi bi-bar-chart"></i></span>
                        <div>
                            <div class="stat-value">${stats.statusDistribution.reduce((a, b) => a + b.count, 0)}</div>
                            <div class="stat-label">Total Tiket</div>
                        </div>
                    </div>
                </div>
            `;
        }
        // --- BAGIAN UPDATE CHART TREN (MODERN GRADIENT) ---
        if (typeof Chart !== "undefined" && document.getElementById('stats-trend-chart')) {
            if (statsChartLoading) statsChartLoading.style.display = 'inline';
            try {
                const trendRes = await fetch(`/api/stats/closed-trend?days=30`, { headers: authHeaders });
                const trendData = await trendRes.json();
                const labels = trendData.map(item => {
                    // Format tanggal label jadi lebih pendek (misal: 24 Nov)
                    const d = new Date(item.date);
                    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                });
                const data = trendData.map(item => item.count);

                // Hancurkan chart lama jika ada
                if (statsTrendChart) statsTrendChart.destroy();

                const ctx = document.getElementById('stats-trend-chart').getContext('2d');

                if (labels.length === 0) {
                    document.getElementById('stats-trend-chart').style.display = 'none';
                    document.getElementById('stats-chart-loading').innerText = 'Tidak ada data grafik';
                } else {
                    document.getElementById('stats-trend-chart').style.display = 'block';
                    document.getElementById('stats-chart-loading').innerText = '';

                    // Buat Gradient Mewah
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)'); // Biru terang di atas
                    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)'); // Transparan di bawah

                    statsTrendChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels,
                            datasets: [{
                                label: 'Tiket Closed',
                                data,
                                fill: true, // Isi area bawah grafik
                                backgroundColor: gradient, // Pakai gradient yang kita buat
                                borderColor: '#3b82f6', // Garis biru solid
                                borderWidth: 3, // Garis sedikit lebih tebal
                                tension: 0.4, // Garis melengkung halus (Curved)
                                pointBackgroundColor: '#ffffff', // Titik putih
                                pointBorderColor: '#3b82f6', // Border titik biru
                                pointBorderWidth: 2,
                                pointRadius: 4, // Ukuran titik
                                pointHoverRadius: 7, // Membesar saat di-hover
                                pointHoverBackgroundColor: '#3b82f6',
                                pointHoverBorderColor: '#ffffff',
                                pointHoverBorderWidth: 3
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false }, // Sembunyikan legenda judul
                                tooltip: {
                                    backgroundColor: 'rgba(15, 23, 42, 0.9)', // Tooltip gelap modern
                                    titleColor: '#f8fafc',
                                    bodyColor: '#f8fafc',
                                    titleFont: { family: 'Inter', size: 13 },
                                    bodyFont: { family: 'Inter', size: 13, weight: 'bold' },
                                    padding: 12,
                                    cornerRadius: 8,
                                    displayColors: false,
                                    callbacks: {
                                        label: function(context) {
                                            return ` ${context.parsed.y} Tiket Selesai`;
                                        }
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    grid: { 
                                        display: false, // Hilangkan grid vertikal
                                        drawBorder: false
                                    },
                                    ticks: {
                                        color: '#64748b',
                                        font: { family: 'Inter', size: 11 },
                                        maxTicksLimit: 8 // Batasi label agar tidak menumpuk
                                    }
                                },
                                y: {
                                    beginAtZero: true,
                                    border: { display: false }, // Hilangkan garis poros Y
                                    grid: {
                                        color: '#f1f5f9', // Grid horizontal sangat halus
                                        borderDash: [5, 5] // Grid putus-putus
                                    },
                                    ticks: { 
                                        precision: 0,
                                        color: '#64748b',
                                        font: { family: 'Inter', size: 11 },
                                        padding: 10
                                    }
                                }
                            },
                            interaction: {
                                mode: 'index',
                                intersect: false,
                            }
                        }
                    });
                }
            } catch (e) {
                console.error(e);
                if (statsTrendChart) statsTrendChart.destroy();
                document.getElementById('stats-trend-chart').style.display = 'none';
                document.getElementById('stats-chart-loading').innerText = 'Gagal memuat grafik';
            }
            if (statsChartLoading) statsChartLoading.style.display = 'none';
        }
        contentArea.innerHTML = `
        <div class="row">
            <div class="col-lg-6 mb-4">
                <div class="card h-100">
                    <div class="card-header bg-white border-bottom-0">
                        <span class="stats-section-title">Tiket Running</span>
                    </div>
                    <div class="card-body" id="running-subcat-list"></div>
                </div>
            </div>
            <div class="col-lg-6 mb-4">
                <div class="card h-100">
                    <div class="card-header bg-white border-bottom-0">
                        <span class="stats-section-title">Closed Hari Ini</span>
                    </div>
                    <div class="card-body" id="closed-today-subcat-list"></div>
                </div>
            </div>
        </div>
        <div class="row">
            <div class="col-lg-6 mb-4">
                <div class="card h-100">
                    <div class="card-header bg-white border-bottom-0">
                        <span class="stats-section-title">Distribusi Jenis Tiket</span>
                    </div>
                    <div class="card-body p-0">
                        <canvas id="subcategoryChart" height="120"></canvas>
                    </div>
                </div>
            </div>
            <div class="col-lg-6 mb-4">
                <div class="card h-100">
                    <div class="card-header bg-white border-bottom-0">
                        <span class="stats-section-title">Distribusi Status Tiket</span>
                    </div>
                    <div class="card-body p-0">
                        <canvas id="statusChart" height="120"></canvas>
                    </div>
                </div>
            </div>
        </div>
        `;

        const runningListDiv = document.getElementById('running-subcat-list');
        if (stats.runningDetails.bySubcategory.length > 0) {
            let html = '<ul class="list-group">';
            stats.runningDetails.bySubcategory.forEach(item => {
                html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                    ${item.subcategory || '-'}
                    <span class="badge bg-primary rounded-pill">${item.count}</span>
                </li>`;
            });
            html += '</ul>';
            runningListDiv.innerHTML = html;
        } else {
            runningListDiv.innerHTML = '<p class="text-center text-muted mt-3">Tidak ada data tiket running.</p>';
        }

        const closedListDiv = document.getElementById('closed-today-subcat-list');
        if (stats.closedTodayDetails.bySubcategory.length > 0) {
            let html = '<ul class="list-group">';
            stats.closedTodayDetails.bySubcategory.forEach(item => {
                html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                    ${item.subcategory || '-'}
                    <span class="badge bg-success rounded-pill">${item.count}</span>
                </li>`;
            });
            html += '</ul>';
            closedListDiv.innerHTML = html;
        } else {
            closedListDiv.innerHTML = '<p class="text-center text-muted mt-3">Belum ada tiket yang selesai hari ini.</p>';
        }
        
        renderSubcategoryChart(stats.subcategoryDistribution);
        renderStatusChart(stats.statusDistribution);

    } catch(error) {
        contentArea.innerHTML = `<p class="text-danger text-center">${error.message}</p>`;
        const statsChartLoading = document.getElementById('stats-chart-loading');
        if (statsChartLoading) statsChartLoading.style.display = 'none';
    }
}

async function fetchActiveTechnicians() {
     try {
        const response = await fetch(`${API_URL_TECHNICIANS}/active`, { headers: authHeaders });
        if (!response.ok) return;
        activeTechniciansCache = await response.json();
    } catch (error) { console.error("Gagal mengambil teknisi aktif:", error); }
}

async function fetchTechnicians() {
    try {
        const response = await fetch(API_URL_TECHNICIANS, { headers: authHeaders });
        if (!response.ok) throw new Error('Gagal');
        const technicians = await response.json();
        renderTechniciansTable(technicians);
    } catch (error) {
        document.getElementById('technicians-table-body').innerHTML = `<tr><td colspan="5" class="text-danger">Gagal memuat data.</td></tr>`;
    }
}

// --- FUNGSI FILTER & RENDER ---

function applyDateFilter() {
    router();
}

function clearDateFilter() {
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    router();
}

function filterByCategory(category, clickedTab) {
    currentCategoryFilter = category;
    document.querySelectorAll('.category-tabs .nav-link').forEach(tab => tab.classList.remove('active'));
    clickedTab.classList.add('active');
    applyFiltersAndRender();
}

function applyFiltersAndRender(page = 1, useBackendPagination = false) {
    let dataSource = ticketsCache;
    if (currentView === 'closed') {
        dataSource = allClosedTicketsCache;
    }

    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    let filteredTickets = dataSource;
    let isFiltered = false;

    if (currentCategoryFilter !== 'Semua') {
        filteredTickets = filteredTickets.filter(ticket => ticket.category === currentCategoryFilter);
        isFiltered = true;
    }

    if (searchTerm) {
        filteredTickets = filteredTickets.filter(ticket =>
            Object.values(ticket).some(val => String(val).toLowerCase().includes(searchTerm))
        );
        isFiltered = true;
    }

    filteredTicketsCache = filteredTickets;
    currentPage = page;

    if (isFiltered) {
        renderTable(filteredTicketsCache, currentPage, false);
        renderPagination(Math.ceil(filteredTicketsCache.length / PAGE_SIZE), currentPage);
    } else {
        renderTable(filteredTicketsCache, currentPage, true);
        renderPagination(backendTotalPages, currentPage);
    }
}

function renderTable(ticketsToRender, page = 1, useBackendPagination = false) {
    const tbody = document.getElementById('ticket-table-body');
    const localUserRole = localStorage.getItem('userRole');
    if (!ticketsToRender || ticketsToRender.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center">Data tiket tidak ditemukan.</td></tr>`;
        return;
    }
    let pagedTickets, startIdx;
    if (useBackendPagination) {
        pagedTickets = ticketsToRender;
        startIdx = (currentPage - 1) * PAGE_SIZE;
    } else {
        startIdx = (page - 1) * PAGE_SIZE;
        const endIdx = startIdx + PAGE_SIZE;
        pagedTickets = ticketsToRender.slice(startIdx, endIdx);
    }

    let rowsHtml = '';
    pagedTickets.forEach((ticket, index) => {
        let actionButtons = 'No Action';
        const historyButton = `<button class="btn btn-sm btn-outline-info" onclick='showHistory(${ticket.id}, ${JSON.stringify(ticket.id_tiket)})' title="Lihat Riwayat"><i class="bi bi-clock-history"></i></button>`;
        if (localUserRole === 'Admin') {
            actionButtons = `<div class="btn-group">${historyButton}<button class="btn btn-sm btn-warning" onclick='openUpdateModal(${JSON.stringify(ticket)})' title="Update"><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-danger" onclick='confirmDeleteTicket(${ticket.id})' title="Hapus"><i class="bi bi-trash-fill"></i></button></div>`;
        } else if (localUserRole === 'User') {
            actionButtons = `<div class="btn-group">${historyButton}<button class="btn btn-sm btn-warning" onclick='openUpdateModal(${JSON.stringify(ticket)})' title="Update"><i class="bi bi-pencil-fill"></i></button></div>`;
        } else {
            actionButtons = historyButton;
        }
        rowsHtml += `<tr>
          <td>${startIdx + index + 1}</td>
          <td>${escapeHTML(ticket.id_tiket)}</td>
          <td>${escapeHTML(ticket.subcategory)}</td>
          <td>${formatDateTimeWIB(ticket.tiket_time)}</td>
          <td>${formatDateTimeWIB(ticket.last_update_time)}</td>
          <td>${escapeHTML(ticket.deskripsi)}</td>
          <td><span class="badge ${getStatusBadge(ticket.status)}">${escapeHTML(ticket.status)}</span></td>
          <td>${escapeHTML(ticket.technician_details)}</td>
          <td>${escapeHTML(ticket.update_progres)}</td>
          <td>${escapeHTML(ticket.updated_by)}</td>
          <td>${actionButtons}</td> 
        </tr>`;
        });
        tbody.innerHTML = rowsHtml;
}

function changePage(page) {
    const searchInput = document.getElementById('searchInput');
    const isFiltered = (currentCategoryFilter !== 'Semua') ||
        (searchInput && searchInput.value.trim() !== '');
    if (isFiltered) {
        applyFiltersAndRender(page);
    } else {
        fetchAndRenderTickets(currentView, page);
    }
}

function renderPagination(totalPages, currentPage) {
    const paginationContainer = document.getElementById('pagination-container');
    if (!paginationContainer || totalPages <= 1) {
        if(paginationContainer) paginationContainer.innerHTML = '';
        return;
    }
    let paginationHtml = '<ul class="pagination justify-content-center">';
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    paginationHtml += `<li class="page-item ${prevDisabled}"><a class="page-link" href="#" onclick="changePage(${currentPage - 1});return false;">Previous</a></li>`;
    for (let i = 1; i <= totalPages; i++) {
        const active = i === currentPage ? 'active' : '';
        paginationHtml += `<li class="page-item ${active}"><a class="page-link" href="#" onclick="changePage(${i});return false;">${i}</a></li>`;
    }
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    paginationHtml += `<li class="page-item ${nextDisabled}"><a class="page-link" href="#" onclick="changePage(${currentPage + 1});return false;">Next</a></li>`;
    paginationHtml += '</ul>';
    paginationContainer.innerHTML = paginationHtml;
}

function renderTechniciansTable(technicians) {
    const tbody = document.getElementById('technicians-table-body');
    const addForm = document.getElementById('addTechnicianForm');
    const userRole = localStorage.getItem('userRole');
    tbody.innerHTML = '';
    technicians.forEach(tech => {
        let actionButtons = '';
        let statusDisplay = tech.is_active ? 'Hadir' : 'Libur';
        if (userRole === 'Admin') {
            actionButtons = `<div class="btn-group"><button class="btn btn-sm btn-outline-primary" onclick='openEditTechnicianModal(${JSON.stringify(tech)})'>Edit</button><button class="btn btn-sm btn-outline-danger" onclick="handleDeleteTechnician('${tech.nik}')">Hapus</button></div>`;
            statusDisplay = `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" ${tech.is_active ? 'checked' : ''} onchange="handleToggleTechnicianStatus('${tech.nik}', this.checked)"><label class="form-check-label">${tech.is_active ? 'Hadir' : 'Libur'}</label></div>`;
        }
        tbody.innerHTML += `<tr><td>${tech.nik}</td><td>${tech.name}</td><td>${tech.phone_number || ''}</td><td>${statusDisplay}</td><td>${actionButtons}</td></tr>`;
    });
    if (userRole !== 'Admin') {
        addForm.style.display = 'none';
        document.querySelector('#techniciansModal .modal-body hr').style.display = 'none';
        document.querySelector('#techniciansModal h6').style.display = 'none';
    } else {
        addForm.style.display = 'flex';
        document.querySelector('#techniciansModal .modal-body hr').style.display = 'block';
        document.querySelector('#techniciansModal h6').style.display = 'block';
    }
}

// --- FUNGSI HANDLER (AKSI PENGGUNA) ---

async function handleAddTechnician(event) {
    event.preventDefault();
    const data = { nik: document.getElementById('tech_nik').value, name: document.getElementById('tech_name').value, phone_number: document.getElementById('tech_phone').value };
    try {
        const response = await fetch(API_URL_TECHNICIANS, { method: 'POST', headers: authHeaders, body: JSON.stringify(data) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        document.getElementById('addTechnicianForm').reset();
        fetchTechnicians();
        fetchActiveTechnicians();
    } catch (error) {
        alert(`Gagal: ${error.message}`);
    }
}

function openEditTechnicianModal(tech) {
    document.getElementById('edit_tech_nik').value = tech.nik;
    document.getElementById('edit_tech_name').value = tech.name;
    document.getElementById('edit_tech_phone').value = tech.phone_number || '';
    editTechnicianModal.show();
}

async function handleEditTechnicianSubmit() {
    const nik = document.getElementById('edit_tech_nik').value;
    const data = { name: document.getElementById('edit_tech_name').value, phone_number: document.getElementById('edit_tech_phone').value };
    try {
        const response = await fetch(`${API_URL_TECHNICIANS}/${nik}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify(data) });
        if (!response.ok) throw new Error('Gagal');
        editTechnicianModal.hide();
        fetchTechnicians();
        fetchActiveTechnicians();
    } catch (error) {
        alert('Gagal menyimpan.');
    }
}

async function handleToggleTechnicianStatus(nik, isActive) {
    try {
        await fetch(`${API_URL_TECHNICIANS}/status/${nik}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ is_active: isActive }) });
        fetchActiveTechnicians();
    } catch (error) {
        alert('Gagal ubah status.');
    }
}

async function handleDeleteTechnician(nik) {
    if (!confirm(`Yakin hapus NIK ${nik}?`)) return;
    try {
        const response = await fetch(`${API_URL_TECHNICIANS}/${nik}`, { method: 'DELETE', headers: authHeaders });
        if (!response.ok) throw new Error('Gagal');
        fetchTechnicians();
        fetchActiveTechnicians();
    } catch (error) {
        alert('Gagal hapus.');
    }
}


// --- FUNGSI MANAJEMEN PENGGUNA BARU ---

async function fetchUsers() {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = `<tr><td colspan="4" class="text-center">Memuat data pengguna...</td></tr>`;
  try {
    const response = await fetch('/api/users', { headers: authHeaders });
    if (!response.ok) throw new Error('Gagal mengambil data');
    const users = await response.json();
    renderUsersTable(users);
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Gagal memuat data pengguna.</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '';
  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Tidak ada pengguna lain.</td></tr>`;
    return;
  }

  users.forEach(user => {
    tbody.innerHTML += `
      <tr>
        <td>${escapeHTML(user.username)}</td>
        <td>
          <select class="form-select form-select-sm" onchange="handleEditUserRole(${user.id}, this.value)">
            <option value="User" ${user.role === 'User' ? 'selected' : ''}>User</option>
            <option value="View" ${user.role === 'View' ? 'selected' : ''}>View</option>
            <option value="Admin" ${user.role === 'Admin' ? 'selected' : ''}>Admin</option>
          </select>
        </td>
        <td>${formatDateTimeWIB(user.created_at)}</td>
        <td>
              <div class="btn-group">
                  <button class="btn btn-sm btn-outline-warning" onclick="handleResetUserPassword(${user.id}, '${escapeHTML(user.username)}')">
                    <i class="bi bi-key"></i> Reset
                  </button>
                  <button class="btn btn-sm btn-outline-danger" onclick="handleDeleteUser(${user.id})">
                    <i class="bi bi-trash-fill"></i> Hapus
                  </button>
              </div>
            </td>
      </tr>
    `;
  });
}

// --- Di public/script.js ---

async function handleResetUserPassword(id, username) {
    // Admin diminta memasukkan password baru (Default: 123456)
    const newPassword = prompt(`Masukkan password BARU untuk pengguna "${username}":`, "123456");
    
    if (newPassword === null) return; // Jika ditekan Cancel
    if (newPassword.trim().length < 6) {
        alert("Password harus minimal 6 karakter.");
        return;
    }

    try {
        const response = await fetch(`/api/users/${id}/reset-password`, {
            method: 'PUT',
            headers: authHeaders,
            body: JSON.stringify({ newPassword: newPassword })
        });
        
        const result = await response.json();
        
        if (!response.ok) throw new Error(result.error);
        
        alert(`Sukses: ${result.message}.\nSilakan infokan password baru ke pengguna.`);
        
    } catch (error) {
        alert('Gagal: ' + error.message);
    }
}

async function handleEditUserRole(id, newRole) {
  if (!confirm(`Yakin ingin mengubah role pengguna ini menjadi ${newRole}?`)) {
    fetchUsers(); // Reset dropdown jika dibatalkan
    return;
  }
  try {
    const response = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ role: newRole })
    });
    if (!response.ok) throw new Error('Gagal mengubah role');
  } catch (error) {
    alert('Gagal: ' + error.message);
    fetchUsers(); // Muat ulang tabel jika gagal
  }
}

async function handleDeleteUser(id) {
  if (!confirm('Yakin ingin menghapus pengguna ini? Tindakan ini tidak dapat dibatalkan.')) {
    return;
  }
  try {
    const response = await fetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    if (!response.ok) throw new Error('Gagal menghapus pengguna');
    fetchUsers(); // Muat ulang tabel setelah sukses
  } catch (error) {
    alert('Gagal: ' + error.message);
  }
}

async function handleAddUser(event) {
  event.preventDefault();
  const messageDiv = document.getElementById('addUserMessage');
  messageDiv.innerHTML = '';

  const username = document.getElementById('new_username').value;
  const password = document.getElementById('new_password').value;
  const role = document.getElementById('new_role').value;

  try {
    const response = await fetch('/api/register', { // Kita gunakan ulang API register yang sudah diamankan
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ username, password, role })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);

    messageDiv.innerHTML = `<div class="alert alert-success">${result.message}</div>`;
    document.getElementById('addUserForm').reset();
    fetchUsers(); // Muat ulang tabel
  } catch (error) {
    messageDiv.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
}

// --- AKHIR FUNGSI MANAJEMEN PENGGUNA ---

async function handleFormSubmit() {
    const d = { category: document.getElementById('category').value, subcategory: document.getElementById('subcategory').value, id_tiket: document.getElementById('id_tiket').value, tiket_time: document.getElementById('tiket_time').value, deskripsi: document.getElementById('deskripsi').value };
    if (!d.id_tiket || !d.deskripsi || !d.tiket_time || !d.category || !d.subcategory) {
        alert('Semua field harus diisi.');
        return;
    }
    try {
        const r = await fetch(API_URL_TICKETS, { method: 'POST', headers: authHeaders, body: JSON.stringify(d) });
        if (!r.ok) { const err = await r.json(); throw new Error(err.error) };
        addTicketModal.hide();
        document.getElementById('addTicketForm').reset();
        router();
    } catch (e) {
        alert('Gagal: ' + e.message);
    }
}

function openUpdateModal(ticket) {
    currentEditingTicket = ticket;
    const userRole = localStorage.getItem('userRole');
    document.getElementById('update_ticket_id').value = ticket.id;
    document.getElementById('update_id_tiket_display').value = ticket.id_tiket;
    document.getElementById('update_status').value = ticket.status;
    
    document.getElementById('update_progres').value = '';

    const categoryDiv = document.getElementById('update_category').parentElement;
    const subcategoryDiv = document.getElementById('update_subcategory').parentElement;
    if (userRole === 'User') {
        categoryDiv.style.display = 'none';
        subcategoryDiv.style.display = 'none';
    } else {
        categoryDiv.style.display = 'block';
        subcategoryDiv.style.display = 'block';
        const categorySelect = document.getElementById('update_category');
        categorySelect.value = ticket.category;
        categorySelect.dispatchEvent(new Event('change'));
        setTimeout(() => {
            document.getElementById('update_subcategory').value = ticket.subcategory;
        }, 50);
    }
    
    const techCheckboxes = document.getElementById('technician-checkboxes-update');
    techCheckboxes.innerHTML = '';
    
    const assignedTechnicianNiks = ticket.assigned_technician_niks ? ticket.assigned_technician_niks.split(',') : [];

    activeTechniciansCache.forEach(tech => {
        const isChecked = assignedTechnicianNiks.includes(tech.nik);
        const displayText = `${tech.name} (${tech.phone_number || 'No HP'})`;
        techCheckboxes.innerHTML += `<div class="form-check"><input class="form-check-input" type="checkbox" value="${tech.nik}" id="tech_update_${tech.nik}" ${isChecked ? 'checked' : ''}><label class="form-check-label" for="tech_update_${tech.nik}">${displayText}</label></div>`;
    });
    updateTicketModal.show();
}

async function handleUpdateSubmit() {
    const selectedTechnicianNiks = [];
    document.querySelectorAll('#technician-checkboxes-update input[type="checkbox"]:checked').forEach(checkbox => { selectedTechnicianNiks.push(checkbox.value); });
    if (selectedTechnicianNiks.length > 5) { alert("Maksimal 5 teknisi."); return; }
    const id = document.getElementById('update_ticket_id').value;
    const userRole = localStorage.getItem('userRole');
    const d = { status: document.getElementById('update_status').value, teknisi: selectedTechnicianNiks, update_progres: document.getElementById('update_progres').value };
    if (userRole === 'Admin') {
        d.category = document.getElementById('update_category').value;
        d.subcategory = document.getElementById('update_subcategory').value;
    } else {
        d.category = currentEditingTicket.category;
        d.subcategory = currentEditingTicket.subcategory;
    }
    try {
        const r = await fetch(`${API_URL_TICKETS}/${id}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify(d) });
        if (!r.ok) throw new Error('Gagal');
        updateTicketModal.hide();
        router();
    } catch (e) {
        alert('Gagal menyimpan.');
    }
}

function confirmDeleteTicket(id) {
    if (confirm("Yakin hapus tiket ini?")) {
        deleteTicket(id);
    }
}

async function deleteTicket(id) {
    try {
        const r = await fetch(`${API_URL_TICKETS}/${id}`, { method: 'DELETE', headers: authHeaders });
        if (!r.ok) throw new Error('Gagal');
        await r.json();
        router();
    } catch (e) {
        alert(e.message);
    }
}

async function handleChangePassword(event) {
    event.preventDefault();
    const messageDiv = document.getElementById('password-message');
    messageDiv.innerHTML = '';
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (newPassword !== confirmPassword) {
        messageDiv.innerHTML = `<div class="alert alert-danger">Password baru tidak cocok.</div>`;
        return;
    }
    try {
        const response = await fetch(`/api/profile/change-password`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ currentPassword, newPassword }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        messageDiv.innerHTML = `<div class="alert alert-success">${result.message}</div>`;
        document.getElementById('changePasswordForm').reset();
    } catch (error) {
        messageDiv.innerHTML = `<div class="alert alert-danger">${error.message || 'Gagal mengubah password.'}</div>`;
    }
}

async function showHistory(ticketId, displayId) {
    const modalBody = document.getElementById('historyModalBody');
    const modalTitle = document.getElementById('historyModalTitle');
    const modal = bootstrap.Modal.getInstance(document.getElementById('historyModal')) || new bootstrap.Modal(document.getElementById('historyModal'));

    if (!modalBody || !modalTitle || !modal) {
        alert("Komponen modal riwayat tidak ditemukan. Halaman mungkin belum dimuat dengan benar.");
        return;
    }

    modalTitle.innerText = `Riwayat Tiket: ${displayId}`;
    modalBody.innerHTML = `<div class="text-center p-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p class="mt-2">Memuat riwayat...</p></div>`;
    modal.show();

    try {
        const response = await fetch(`${API_URL_TICKETS}/${ticketId}/history`, { headers: authHeaders });
        if (!response.ok) {
            throw new Error(`Gagal mengambil riwayat: ${response.statusText}`);
        }
        const history = await response.json();

        if (!Array.isArray(history) || history.length === 0) {
            modalBody.innerHTML = `<p class="text-center text-muted p-3">Belum ada riwayat perubahan untuk tiket ini.</p>`;
        } else {
            let html = '<ul class="list-group">';
            history.forEach(item => {
                html += `<li class="list-group-item"><div><strong>Waktu:</strong> ${formatDateTimeWIB(item.change_timestamp)}</div><div><div><strong>Perubahan:</strong> ${item.change_details || '-'}</div><div><strong>Diupdate oleh:</strong> ${item.changed_by || '-'}</div></li>`;
            });
            html += '</ul>';
            modalBody.innerHTML = html;
        }
    } catch (error) {
        console.error('Gagal memuat riwayat:', error);
        modalBody.innerHTML = `<div class="alert alert-danger m-3">Gagal memuat riwayat: ${error.message}</div>`;
    }
}

// --- FUNGSI HELPERS & UTILITAS ---

async function exportClosedTickets() {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    
    let url = `${API_URL_TICKETS}/closed/export`;
    const separator = url.includes('?') ? '&' : '?';
    url += `${separator}_t=${Date.now()}`;

    if (startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
    }

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Gagal mengekspor data.');
        }

        const blob = await response.blob();
        
        const downloadUrl = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = downloadUrl;
        
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'Laporan_Tiket_Closed.xlsx';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
            if (filenameMatch.length === 2) filename = filenameMatch[1];
        }
        
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        a.remove();
        
        window.URL.revokeObjectURL(downloadUrl);

    } catch (error) {
        alert(error.message);
    }
}

// --- public/script.js ---

async function generateReport() {
    const btn = document.querySelector('button[onclick="generateReport()"]');
    const originalText = btn ? btn.innerText : 'Generate Laporan';
    if(btn) {
        btn.innerText = "Memuat Data...";
        btn.disabled = true;
    }

    try {
        // 1. Ambil Data Terbaru dari Server
        const [resRunning, resClosed] = await Promise.all([
            fetch(`${API_URL_TICKETS}/running?limit=2000`, { headers: authHeaders }),
            fetch(`${API_URL_TICKETS}/closed?limit=2000`, { headers: authHeaders })
        ]);

        const dataRunning = await resRunning.json();
        const dataClosed = await resClosed.json();

        let allRunning = dataRunning.tickets || [];
        let allClosed = dataClosed.tickets || [];

        // 2. Filter Kategori (Sesuai Tab yang Aktif)
        if (currentCategoryFilter !== 'Semua') {
            allRunning = allRunning.filter(t => t.category === currentCategoryFilter);
            allClosed = allClosed.filter(t => t.category === currentCategoryFilter);
        }

        // 3. Filter Laporan Harian
        const reportRunning = allRunning; // Ambil SEMUA Running
        // Ambil Closed HANYA yang last_update_time == HARI INI (WIB)
        const reportClosed = allClosed.filter(t => isToday(t.last_update_time));

        if (reportRunning.length === 0 && reportClosed.length === 0) {
            alert("Laporan Nihil: Tidak ada tiket Running maupun tiket Closed hari ini.");
            return;
        }

        // 4. Format Header (WIB)
        const now = new Date();
        const optionsDate = { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric' };
        const optionsTime = { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false };
        
        const tanggal = new Intl.DateTimeFormat('id-ID', optionsDate).format(now).replace(/\//g, '-');
        const jam = new Intl.DateTimeFormat('id-ID', optionsTime).format(now).replace(':', '.');
        const totalTiket = reportRunning.length + reportClosed.length;

        // 5. Susun Teks Laporan
        let t = `*Monitoring Tiket ${currentCategoryFilter.toUpperCase()} Area Bekasi*\n`;
        t += `*Tanggal : ${tanggal}\n`;
        t += `*Jam : ${jam}\n`;
        t += `================================\n`;

        t += `*).Jumlah Tiket Total  : ${totalTiket} Tiket*\n`;
        t += `- Sisa Tiket Running    : ${reportRunning.length} tiket\n`;
        t += `- Tiket Closed Hari Ini : ${reportClosed.length} tiket\n\n`;

        // List Closed
        if (reportClosed.length > 0) {
            t += `*)Closed  : ${reportClosed.length} tiket\n`;
            reportClosed.forEach((ti, i) => {
                t += `${i + 1}.✅${ti.id_tiket}  ${ti.deskripsi || '-'}\n`;
                t += `RCA : ${ti.update_progres || 'Done'}\n`;
                t += `Teknisi : ${ti.technician_details || '-'}\n\n`;
            });
        } else {
            t += `*)Closed  : 0 tiket\n\n`;
        }

        // List Running
        if (reportRunning.length > 0) {
            t += `*).ON Progres    : ${reportRunning.length} tiket\n`;
            reportRunning.forEach((ti, i) => {
                t += `${i + 1}.❌${ti.id_tiket}  ${ti.deskripsi || '-'}\n`;
                t += `Update : ${ti.update_progres || 'Belum ada update'}\n`;
                t += `Teknisi : ${ti.technician_details || '-'}\n\n`;
            });
        } else {
            t += `*).ON Progres    : 0 tiket\n`;
        }

        t += `----------------------------------------\n`;
        t += `_Generated by Dashboard System_`;

        document.getElementById('report-textarea').value = t;
        reportModal.show();

    } catch (error) {
        console.error("Error generating report:", error);
        alert("Gagal menyusun laporan: " + error.message);
    } finally {
        if(btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}

function copyReportToClipboard() {
    const t = document.getElementById('report-textarea');
    t.select();
    navigator.clipboard.writeText(t.value).then(() => alert("Laporan disalin!")).catch(err => alert("Gagal menyalin."));
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userRole');
    window.location.href = './login.html';
}

// --- FUNGSI BARU untuk Membersihkan string dari karakter HTML berbahaya untuk mencegah XSS---
/**
 * 
 * @param {string} str String yang akan di-sanitize.
 * @returns {string} String yang aman untuk ditampilkan di HTML.
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
// ------------------------------------


// --- FUNGSI PEMFORMAT WIB YANG DIPERBAIKI ---

function formatDateTimeWIB(dateTimeString) {
    if (!dateTimeString) return '';
    
    // Parse tanggal dari server (yang sudah dalam timezone WIB)
    const date = new Date(dateTimeString);
    
    if (isNaN(date.getTime())) {
        console.error('[ERROR] formatDateTimeWIB: Tanggal tidak valid:', dateTimeString);
        return dateTimeString;
    }
    
    // Format ke WIB dengan Intl.DateTimeFormat
    const options = {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    
    try {
        const formatted = new Intl.DateTimeFormat('id-ID', options).format(date);
        return formatted + ' WIB';
    } catch (error) {
        console.error('[ERROR] formatDateTimeWIB: Gagal format:', error);
        return dateTimeString;
    }
}

function getStatusBadge(s) {
    s = s ? s.toUpperCase() : '';
    if (s === 'OPEN') return 'bg-danger';
    if (s === 'SC') return 'bg-primary';
    if (s === 'CLOSED') return 'bg-success';
    return 'bg-secondary';
}

function getStatusIcon(s) {
    s = s ? s.toUpperCase() : '';
    if (s === 'OPEN') return '❌';
    if (s === 'SC') return '🟡';
    if (s === 'CLOSED') return '✅';
    return '❓';
}

function updateSubcategoryOptions(event) {
    const isUpdateForm = event.target.id.startsWith('update_');
    const category = event.target.value;
    const subcategorySelect = document.getElementById(isUpdateForm ? 'update_subcategory' : 'subcategory');
    subcategorySelect.innerHTML = '<option value="" selected disabled>Pilih Sub-kategori...</option>';
    if (category && categories[category]) {
        categories[category].forEach(sub => { subcategorySelect.innerHTML += `<option value="${sub}">${sub}</option>`; });
        subcategorySelect.disabled = false;
    } else { subcategorySelect.disabled = true; }
}

// --- FUNGSI-FUNGSI CHART ---

// --- FUNGSI-FUNGSI CHART (MODERN REDESIGN) ---

function renderSubcategoryChart(data) {
    const ctx = document.getElementById('subcategoryChart');
    if (!ctx) return;

    if (subcategoryChart) {
        subcategoryChart.destroy();
    }

    const labels = data.map(item => item.subcategory || 'Tidak Dikategorikan');
    const counts = data.map(item => item.count);

    // Palette Warna Modern (Tailwind-ish)
    const modernColors = [
        '#3b82f6', // Blue
        '#10b981', // Emerald
        '#8b5cf6', // Violet
        '#f59e0b', // Amber
        '#ef4444', // Red
        '#06b6d4', // Cyan
        '#ec4899', // Pink
        '#6366f1', // Indigo
    ];

    // Ulangi warna jika data lebih banyak dari palette
    const backgroundColors = data.map((_, index) => modernColors[index % modernColors.length]);

    subcategoryChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Jumlah Tiket',
                data: counts,
                backgroundColor: backgroundColors,
                borderRadius: 6, // Sudut batang membulat
                barPercentage: 0.6, // Batang tidak terlalu gemuk
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }, // Sembunyikan legenda untuk bar chart
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)', // Tooltip gelap
                    titleFont: { family: 'Inter', size: 13 },
                    bodyFont: { family: 'Inter', size: 13 },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { 
                        precision: 0,
                        font: { family: 'Inter', size: 11 },
                        color: '#64748b'
                    },
                    grid: {
                        color: '#f1f5f9', // Grid sangat halus
                        borderDash: [5, 5] // Grid putus-putus
                    },
                    border: { display: false } // Hilangkan garis poros Y
                },
                x: {
                    ticks: {
                        font: { family: 'Inter', size: 11 },
                        color: '#64748b',
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 0
                    },
                    grid: { display: false }, // Hilangkan grid vertikal
                    border: { display: false }
                }
            }
        }
    });
}

function renderStatusChart(data) {
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    if (statusChart) {
        statusChart.destroy();
    }
    
    const labels = data.map(item => item.status || 'Tidak Diketahui');
    const counts = data.map(item => item.count);

    // Mapping Warna Status Konsisten dengan Badge
    const statusColors = labels.map(status => {
        const s = status ? status.toUpperCase() : '';
        if (s === 'OPEN') return '#ef4444';   // Merah
        if (s === 'SC') return '#3b82f6';     // Biru
        if (s === 'CLOSED') return '#10b981'; // Hijau
        return '#94a3b8'; // Abu-abu (Lainnya)
    });

    statusChart = new Chart(ctx, {
        type: 'doughnut', // Ubah Pie jadi Doughnut (Lebih Modern)
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: statusColors,
                borderWidth: 0, // Hilangkan border putih kasar
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%', // Lubang tengah lebih besar (Cincin Tipis)
            plugins: {
                legend: {
                    position: 'right', // Legenda di samping kanan
                    labels: {
                        usePointStyle: true, // Pakai titik bulat, bukan kotak
                        pointStyle: 'circle',
                        font: { family: 'Inter', size: 12 },
                        color: '#475569',
                        padding: 20
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    bodyFont: { family: 'Inter', size: 13 },
                    padding: 10,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const sum = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / sum) * 100).toFixed(1);
                            return ` ${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}


// --- FUNGSI HELPER BARU (Letakkan di paling bawah file) ---
function isToday(dateString) {
    if (!dateString) return false;
    
    const options = { 
        timeZone: 'Asia/Jakarta', 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
    };
    
    const dateCheck = new Date(dateString);
    const dateNow = new Date();
    
    const strCheck = new Intl.DateTimeFormat('id-ID', options).format(dateCheck);
    const strNow = new Intl.DateTimeFormat('id-ID', options).format(dateNow);
    
    return strCheck === strNow;
}