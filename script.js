// Konstanta dan Variabel Global
const API_BASE_URL = 'https://dashboard-tiket-app-production-8656.up.railway.app'; // PASTIKAN URL INI BENAR
const API_URL_TICKETS = `${API_BASE_URL}/api/tickets`;
const API_URL_TECHNICIANS = `${API_BASE_URL}/api/technicians`;

let addTicketModal, updateTicketModal, reportModal, techniciansModal, editTechnicianModal, historyModal;
let ticketsCache = [], activeTechniciansCache = [];
let currentCategoryFilter = 'Semua';
let currentEditingTicket = null;
let currentView = 'running'; // KUNCI: Variabel untuk mengingat view saat ini
const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')}` };

const categories = {
    SQUAT: ["TSEL", "OLO"],
    MTEL: ["FIBERISASI", "TIS", "MMP"],
    UMT: ["UMT"],
    CENTRATAMA: ["FSI"]
};

// Tambahkan variabel global untuk pagination hasil filter
let filteredTicketsCache = [];
let currentPage = 1;
const PAGE_SIZE = 20;

// Tambahkan variabel global untuk pagination backend
let backendTotalPages = 1;

// Inisialisasi Aplikasi
document.addEventListener('DOMContentLoaded', () => {
    addTicketModal = new bootstrap.Modal(document.getElementById('addTicketModal'));
    updateTicketModal = new bootstrap.Modal(document.getElementById('updateTicketModal'));
    reportModal = new bootstrap.Modal(document.getElementById('reportModal'));
    techniciansModal = new bootstrap.Modal(document.getElementById('techniciansModal'));
    editTechnicianModal = new bootstrap.Modal(document.getElementById('editTechnicianModal'));
    historyModal = new bootstrap.Modal(document.getElementById('historyModal'));
    
    document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
    document.getElementById('addTechnicianForm').addEventListener('submit', handleAddTechnician);
    document.getElementById('save-edit-tech-btn').addEventListener('click', handleEditTechnicianSubmit);

    document.getElementById('category').addEventListener('change', updateSubcategoryOptions);
    document.getElementById('update_category').addEventListener('change', updateSubcategoryOptions);

    applyRoles();
    fetchActiveTechnicians();
    router(); 
});

window.addEventListener('hashchange', router);

// --- FUNGSI UTAMA & NAVIGASI ---

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); }
function applyRoles() { if (localStorage.getItem('userRole') === 'View') { document.getElementById('add-ticket-btn').style.display = 'none'; } }

async function router() {
    const hash = window.location.hash || '#running';
    const pageTitle = document.getElementById('page-title');
    const contentArea = document.getElementById('content-area');
    const mainActions = document.getElementById('main-actions');
    const dateFilterContainer = document.getElementById('date-filter-container');
    const exportBtn = document.getElementById('export-btn');

    document.querySelectorAll('#sidebar .nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === hash) link.classList.add('active');
    });

    mainActions.style.display = 'flex'; 
    dateFilterContainer.style.display = 'none';
    if(exportBtn) exportBtn.style.display = 'none';

    switch (hash) {
        case '#running':
            currentView = 'running'; // Set view saat ini
            pageTitle.innerText = 'Tiket Running';
            contentArea.innerHTML = createTicketTableHTML();
            dateFilterContainer.style.display = 'flex'; 
            await fetchAndRenderTickets('running');
            break;
        case '#closed':
            currentView = 'closed'; // Set view saat ini
            pageTitle.innerText = 'Tiket Closed';
            contentArea.innerHTML = createTicketTableHTML();
            dateFilterContainer.style.display = 'flex'; 
            if(exportBtn) exportBtn.style.display = 'block';
            await fetchAndRenderTickets('closed');
            break;
        case '#stats':
            pageTitle.innerText = 'Statistik';
            mainActions.style.display = 'none';
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
            applyFiltersAndRender(currentPage, true); // true = gunakan backend pagination
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
        const response = await fetch(`${API_BASE_URL}/api/profile`, { headers: authHeaders });
        if (response.status === 401 || response.status === 403) { logout(); return; }
        const user = await response.json();
        contentArea.innerHTML = `<div class="row"><div class="col-md-6"><div class="card"><div class="card-header">Detail Akun</div><div class="card-body"><p><strong>Username:</strong> ${user.username}</p><p><strong>Peran (Role):</strong> ${user.role}</p><p><strong>Tanggal Bergabung:</strong> ${formatDateTime(user.created_at)}</p></div></div></div><div class="col-md-6 mt-3 mt-md-0"><div class="card"><div class="card-header">Ganti Password</div><div class="card-body"><form id="changePasswordForm"><div class="mb-3"><label for="currentPassword" class="form-label">Password Saat Ini</label><input type="password" class="form-control" id="currentPassword" required></div><div class="mb-3"><label for="newPassword" class="form-label">Password Baru</label><input type="password" class="form-control" id="newPassword" required></div><div class="mb-3"><label for="confirmPassword" class="form-label">Konfirmasi Password Baru</label><input type="password" class="form-control" id="confirmPassword" required></div><button type="submit" class="btn btn-primary">Simpan Password</button></form><div id="password-message" class="mt-3"></div></div></div></div></div>`;
        document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);
    } catch (error) { contentArea.innerHTML = `<p class="text-danger">Gagal memuat data profil.</p>`; }
}

async function fetchAndRenderStats() {
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = `
        <div class="row">
            <div class="col-lg-6 mb-4">
                <div class="card h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">Tiket Sedang Berjalan (Running)</h5>
                        <span class="badge bg-primary rounded-pill fs-5" id="total-running-stat">...</span>
                    </div>
                    <div class="card-body" id="running-details-body">
                        <p class="text-muted">Rincian per Jenis Tiket (Sub-kategori):</p>
                        <div id="running-subcat-list"></div>
                    </div>
                </div>
            </div>
            <div class="col-lg-6 mb-4">
                <div class="card h-100">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">Tiket Selesai Hari Ini</h5>
                        <span class="badge bg-success rounded-pill fs-5" id="total-closed-today-stat">...</span>
                    </div>
                    <div class="card-body" id="closed-today-details-body">
                        <p class="text-muted">Rincian per Jenis Tiket (Sub-kategori):</p>
                        <div id="closed-today-subcat-list"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    try {
        const response = await fetch(`${API_BASE_URL}/api/stats`, { headers: authHeaders });
        if (!response.ok) throw new Error('Gagal mengambil data statistik');
        const stats = await response.json();
        if (!stats.runningDetails || !stats.closedTodayDetails) {
            throw new Error('Format data statistik tidak sesuai.');
        }
        // Total
        document.getElementById('total-running-stat').innerText = stats.runningDetails.total;
        document.getElementById('total-closed-today-stat').innerText = stats.closedTodayDetails.total;

        // Rincian per subkategori (angka saja, tanpa diagram)
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
    } catch(error) {
        contentArea.innerHTML = `<p class="text-danger text-center">${error.message}</p>`;
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
    let filteredTickets = ticketsCache;
    const searchInput = document.getElementById('searchInput');
    let isFiltered = false;

    if (currentCategoryFilter !== 'Semua') {
        filteredTickets = filteredTickets.filter(ticket => ticket.category === currentCategoryFilter);
        isFiltered = true;
    }
    if (searchInput) {
        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            filteredTickets = filteredTickets.filter(ticket => 
                Object.values(ticket).some(val => String(val).toLowerCase().includes(searchTerm))
            );
            isFiltered = true;
        }
    }
    filteredTicketsCache = filteredTickets;
    currentPage = page;

    if (isFiltered) {
        // Pagination lokal
        renderTable(filteredTicketsCache, currentPage, false);
        renderPagination(Math.ceil(filteredTicketsCache.length / PAGE_SIZE), currentPage);
    } else {
        // Pagination backend
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
        // Pagination logic lokal
        startIdx = (page - 1) * PAGE_SIZE;
        const endIdx = startIdx + PAGE_SIZE;
        pagedTickets = ticketsToRender.slice(startIdx, endIdx);
    }

    let rowsHtml = '';
    pagedTickets.forEach((ticket, index) => {
        let actionButtons = 'No Action';
        const historyButton = `<button class="btn btn-sm btn-outline-info" onclick="showHistory(${ticket.id}, '${ticket.id_tiket}')" title="Lihat Riwayat"><i class="bi bi-clock-history"></i></button>`;
        if (localUserRole === 'Admin') {
            actionButtons = `<div class="btn-group">${historyButton}<button class="btn btn-sm btn-warning" onclick='openUpdateModal(${JSON.stringify(ticket)})' title="Update"><i class="bi bi-pencil-fill"></i></button><button class="btn btn-sm btn-danger" onclick='confirmDeleteTicket(${ticket.id})' title="Hapus"><i class="bi bi-trash-fill"></i></button></div>`;
        } else if (localUserRole === 'User') {
            actionButtons = `<div class="btn-group">${historyButton}<button class="btn btn-sm btn-warning" onclick='openUpdateModal(${JSON.stringify(ticket)})' title="Update"><i class="bi bi-pencil-fill"></i></button></div>`;
        } else {
            actionButtons = historyButton;
        }
        // Nomor urut sesuai halaman
        rowsHtml += `<tr><td>${startIdx + index + 1}</td><td>${ticket.id_tiket || ''}</td><td>${ticket.subcategory || ''}</td><td>${formatDateTime(ticket.tiket_time)}</td><td>${formatDateTime(ticket.last_update_time)}</td><td>${ticket.deskripsi || ''}</td><td><span class="badge ${getStatusBadge(ticket.status)}">${ticket.status || ''}</span></td><td>${ticket.technician_details || ''}</td><td>${ticket.update_progres || ''}</td><td>${ticket.updated_by || ''}</td><td>${actionButtons}</td></tr>`;
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
    document.getElementById('update_progres').value = ticket.update_progres || '';
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
    const assignedTechnicianNiks = ticket.teknisi ? ticket.teknisi.split(',') : [];
    activeTechniciansCache.forEach(tech => {
        const isChecked = assignedTechnicianNiks.includes(tech.nik);
        techCheckboxes.innerHTML += `<div class="form-check"><input class="form-check-input" type="checkbox" value="${tech.nik}" id="tech_update_${tech.nik}" ${isChecked ? 'checked' : ''}><label class="form-check-label" for="tech_update_${tech.nik}">${tech.name}</label></div>`;
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
        const response = await fetch(`${API_BASE_URL}/api/profile/change-password`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ currentPassword, newPassword }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        messageDiv.innerHTML = `<div class="alert alert-success">${result.message}</div>`;
        document.getElementById('changePasswordForm').reset();
    } catch (error) {
        messageDiv.innerHTML = `<div class="alert alert-danger">${error.message || 'Gagal mengubah password.'}</div>`;
    }
}

async function showHistory(ticketId, displayId) {
    const modalBody = document.getElementById('history-modal-body');
    const modalTitle = document.getElementById('history-modal-title');
    modalTitle.innerText = `Riwayat Tiket: ${displayId}`;
    modalBody.innerHTML = `<p class="text-center">Memuat riwayat...</p>`;
    try {
        const response = await fetch(`${API_URL_TICKETS}/${ticketId}/history`, { headers: authHeaders });
        if (!response.ok) throw new Error('Gagal mengambil riwayat.');
        const history = await response.json();
        if (!Array.isArray(history) || history.length === 0) {
            modalBody.innerHTML = `<p class="text-center text-muted">Belum ada riwayat perubahan.</p>`;
        } else {
            let html = '<ul class="list-group">';
            history.forEach(item => {
                html += `<li class="list-group-item">
                    <div><strong>Status:</strong> ${item.status || ''}</div>
                    <div><strong>Update Progres:</strong> ${item.update_progres || ''}</div>
                    <div><strong>Teknisi:</strong> ${item.technician_details || ''}</div>
                    <div><strong>Updated By:</strong> ${item.updated_by || ''}</div>
                    <div><small class="text-muted">${formatDateTime(item.updated_at)}</small></div>
                </li>`;
            });
            html += '</ul>';
            modalBody.innerHTML = html;
        }
        historyModal.show();
    } catch (error) {
        modalBody.innerHTML = `<p class="text-center text-danger">${error.message}</p>`;
    }
}


// --- FUNGSI HELPERS & UTILITAS ---

function generateReport() {
    let ticketsToReport = ticketsCache;
    if (currentCategoryFilter !== 'Semua') {
        ticketsToReport = ticketsToReport.filter(ticket => ticket.category === currentCategoryFilter);
    }
    if (ticketsToReport.length === 0) {
        alert("Tidak ada data pada tab ini untuk dilaporkan.");
        return;
    }
    let t = "";
    ticketsToReport.forEach((ti, i) => {
        const it = `${i + 1}. ${getStatusIcon(ti.status)}Fiber Cut CSR ## ${ti.deskripsi||''}\nTicket No.      : ${ti.id_tiket||''}\nTicket Time     : ${formatDateTime(ti.tiket_time)} WIB\nUpdate          : ${ti.update_progres||''}\nTeknisi         : ${ti.technician_details||'NULL'}\nstatus          : ${ti.status||''}`;
        t += it;
        if (i < ticketsToReport.length - 1) { t += "\n\n"; }
    });
    document.getElementById('report-textarea').value = t;
    reportModal.show();
}

async function exportClosedTickets() {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    let url = `${API_URL_TICKETS}/closed/export`;

    if (startDate && endDate) {
        url += `?startDate=${startDate}&endDate=${endDate}`;
    }

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` } });
        if (!response.ok) {
            throw new Error('Gagal mengekspor data. Tidak ada data pada rentang tanggal ini.');
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `Laporan Tiket Closed - ${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

    } catch (error) {
        alert(error.message);
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

function formatDateTime(s) {
    if (!s) return '';
    return new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', hour12: false });
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