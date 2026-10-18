/**
 * CSPC Lost & Found Portal - Frontend Controller
 * Implements client-side state, card selection, live filtering, and modal dialogs.
 */

// Active selected item in the details panel
let currentSelectedItem = null;

// ── Sidebar Toggle (Desktop / Tablet) ─────────────────────────────────────
const SIDEBAR_KEY = 'cspc_sidebar_collapsed';

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('sidebar-collapsed');
  localStorage.setItem(SIDEBAR_KEY, isCollapsed ? '1' : '0');
}

function toggleAdminSidebar() {
  const sidebar = document.querySelector('.admin-sidebar');
  if (!sidebar) return;
  const isCollapsed = sidebar.classList.toggle('sidebar-collapsed');
  localStorage.setItem(SIDEBAR_KEY, isCollapsed ? '1' : '0');
}

// ── Mobile Bottom Sheet ────────────────────────────────────────────────────
function openMobileSheet() {
  const sheet = document.getElementById('mobile-item-sheet');
  const overlay = document.getElementById('mobile-sheet-overlay');
  if (!sheet || !overlay) return;
  // Only open on mobile viewport
  if (window.innerWidth > 768) return;
  overlay.classList.add('open');
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMobileSheet() {
  const sheet = document.getElementById('mobile-item-sheet');
  const overlay = document.getElementById('mobile-sheet-overlay');
  if (!sheet || !overlay) return;
  sheet.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function populateMobileSheet(item) {
  const refCode = `FI-${String(item.item_id).padStart(4, '0')}`;
  const catCode = item.category_id ? `CAT-${String(item.category_id).padStart(3, '0')} · ` : '';

  const title = document.getElementById('sheet-item-title');
  const ref = document.getElementById('sheet-item-ref');
  const cat = document.getElementById('sheet-item-category');
  const type = document.getElementById('sheet-item-type');
  const appearance = document.getElementById('sheet-item-appearance');
  const location = document.getElementById('sheet-item-location');
  const date = document.getElementById('sheet-item-date');
  const finder = document.getElementById('sheet-item-finder');

  if (title) title.textContent = item.title;
  if (ref) ref.textContent = refCode;
  if (cat) cat.textContent = `${catCode}${item.category_name || 'General Valuables'}`;
  if (type) type.textContent = item.brand || 'Personal Item';
  if (appearance) appearance.textContent = item.description || (item.color ? `${item.color} finish` : 'In good physical condition');
  if (location) location.textContent = item.location_name || 'Main Campus Grounds';
  if (date) date.textContent = new Date(item.found_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (finder) finder.textContent = item.finder_name || 'Juan Reyes';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Restore sidebar collapsed state from localStorage
  const sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === '1';
  if (sidebarCollapsed && window.innerWidth > 768) {
    const sidebar = document.querySelector('.sidebar, .admin-sidebar');
    if (sidebar) sidebar.classList.add('sidebar-collapsed');
  }

  const firstCard = document.querySelector('.found-item-card');
  if (firstCard) {
    // If cards exist, ensure the first is active
    firstCard.classList.add('selected');
  }

  // Live search debouncing
  const searchInput = document.getElementById('catalog-search-input');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyFilters();
      }, 300);
    });
  }

  // Initialize staff dashboard tables pagination & filters if tables are on page
  if (document.getElementById('staff-items-table')) {
    runStaffInventoryFilter();
  }
  if (document.getElementById('staff-claims-table')) {
    filterStaffClaims();
  }
  if (document.getElementById('staff-audit-table')) {
    filterStaffAuditLogs();
  }

  // Initialize public catalog pagination if on public view
  const publicRow = document.getElementById('public-pagination-row');
  if (publicRow) {
    const page = parseInt(publicRow.getAttribute('data-page'), 10) || 1;
    const total = parseInt(publicRow.getAttribute('data-total'), 10) || 0;
    const pageSize = parseInt(publicRow.getAttribute('data-page-size'), 10) || 6;
    renderPublicPagination({ page, total, pageSize });
  }

  // Close bottom sheet on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileSheet();
  });
});



// ── 1. Card Selection & Side Panel Synchronization ─────────────────────────
function selectCardItem(item, cardEl) {
  currentSelectedItem = item;

  // Update card border & checkmark badge
  document.querySelectorAll('.found-item-card').forEach((c) => c.classList.remove('selected'));
  if (cardEl) {
    cardEl.classList.add('selected');
  }

  // Synchronize Right Sticky Details Panel
  const sideTitle = document.getElementById('side-item-title');
  const sideRef = document.getElementById('side-item-ref');
  const sideCategory = document.getElementById('side-item-category');
  const sideType = document.getElementById('side-item-type');
  const sideAppearance = document.getElementById('side-item-appearance');
  const sideLocation = document.getElementById('side-item-location');
  const sideDate = document.getElementById('side-item-date');
  const sideFinder = document.getElementById('side-item-finder');

  const refCode = `FI-${String(item.item_id).padStart(4, '0')}`;
  const catCode = item.category_id ? `CAT-${String(item.category_id).padStart(3, '0')} · ` : '';

  if (sideTitle) sideTitle.textContent = item.title;
  if (sideRef) sideRef.textContent = refCode;
  if (sideCategory) sideCategory.textContent = `${catCode}${item.category_name || 'General Valuables'}`;
  if (sideType) sideType.textContent = item.brand || 'Personal Item';
  if (sideAppearance) sideAppearance.textContent = item.description || (item.color ? `${item.color} finish` : 'In good physical condition');
  if (sideLocation) sideLocation.textContent = item.location_name || 'Main Campus Grounds';
  if (sideDate) sideDate.textContent = new Date(item.found_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (sideFinder) sideFinder.textContent = item.finder_name || 'Juan Reyes';

  // Also pre-fill the claim modal
  const claimItemId = document.getElementById('claim-item-id');
  const claimSummaryRef = document.getElementById('modal-claim-item-ref');
  const claimSummaryTitle = document.getElementById('modal-claim-item-title');

  if (claimItemId) claimItemId.value = item.item_id;
  if (claimSummaryRef) claimSummaryRef.textContent = refCode;
  if (claimSummaryTitle) claimSummaryTitle.textContent = item.title;

  // On mobile: populate and open the bottom sheet instead of the hidden side panel
  if (window.innerWidth <= 768) {
    populateMobileSheet(item);
    openMobileSheet();
  }
}

let publicCurrentPage = 1;
const publicPageSize = 6;

async function applyFilters(page = 1) {
  publicCurrentPage = page;
  const categoryId = document.getElementById('filter-category')?.value || '';
  const locationId = document.getElementById('filter-location')?.value || '';
  const search = document.getElementById('catalog-search-input')?.value.trim() || '';

  const params = new URLSearchParams();
  if (categoryId) params.append('category_id', categoryId);
  if (locationId) params.append('location_id', locationId);
  if (search) params.append('search', search);
  params.append('page', String(publicCurrentPage));
  params.append('pageSize', String(publicPageSize));

  const gridContainer = document.getElementById('cards-grid-list');
  const countText = document.getElementById('grid-count-text');
  const statBigNumber = document.getElementById('stats-total-count');

  if (!gridContainer) return;
  gridContainer.style.opacity = '0.5';

  try {
    const res = await fetch(`/api/v1/items?${params.toString()}`);
    const json = await res.json();

    if (!res.ok) {
      throw new Error(json.error?.message || 'Failed to query found items');
    }

    const items = json.data || [];
    const meta = json.meta || { page: publicCurrentPage, pageSize: publicPageSize, total: items.length };
    const total = meta.total ?? items.length;

    const startItem = total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
    const endItem = Math.min(startItem + items.length - (total === 0 ? 0 : 1), total);

    if (countText) {
      countText.textContent = total === 0 ? 'Showing 0 items' : `Showing ${startItem}–${endItem} of ${total} items`;
    }
    if (statBigNumber) {
      statBigNumber.textContent = total;
    }

    renderItemsGrid(items);
    renderPublicPagination(meta);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    gridContainer.style.opacity = '1';
  }
}

function renderPublicPagination(meta) {
  const paginationRow = document.getElementById('public-pagination-row');
  const infoEl = document.getElementById('public-pagination-info');
  const controlsEl = document.getElementById('public-pagination-controls');

  if (!paginationRow || !controlsEl) return;

  const page = meta.page || 1;
  const pageSize = meta.pageSize || publicPageSize;
  const total = meta.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (infoEl) {
    infoEl.innerHTML = `Page <strong>${page}</strong> of <strong>${totalPages}</strong> &bull; <strong>${total}</strong> items recorded`;
  }

  controlsEl.innerHTML = '';

  // Prev Button
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'page-nav-arrow';
  prevBtn.innerHTML = '&lsaquo;';
  prevBtn.title = 'Previous page';
  prevBtn.disabled = page <= 1 || total === 0;
  prevBtn.onclick = () => goToPublicPage(page - 1);
  controlsEl.appendChild(prevBtn);

  // Numbered buttons
  for (let p = 1; p <= totalPages; p++) {
    if (
      p === 1 || 
      p === totalPages || 
      (p >= page - 1 && p <= page + 1)
    ) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-num-btn ${p === page ? 'active' : ''}`;
      btn.textContent = String(p);
      btn.onclick = () => goToPublicPage(p);
      controlsEl.appendChild(btn);
    } else if (
      (p === page - 2 && p > 1) || 
      (p === page + 2 && p < totalPages)
    ) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'page-ellipsis';
      ellipsis.textContent = '…';
      controlsEl.appendChild(ellipsis);
    }
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'page-nav-arrow';
  nextBtn.innerHTML = '&rsaquo;';
  nextBtn.title = 'Next page';
  nextBtn.disabled = page >= totalPages || total === 0;
  nextBtn.onclick = () => goToPublicPage(page + 1);
  controlsEl.appendChild(nextBtn);
}

function goToPublicPage(page) {
  applyFilters(page);
  const portalHeader = document.querySelector('.public-portal-layout');
  if (portalHeader) {
    portalHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderItemsGrid(items) {
  const container = document.getElementById('cards-grid-list');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 3rem; text-align: center;">
        <p style="color: #64748B; font-size: 0.95rem;">No items currently found matching this filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map((item, index) => {
    const isSelected = index === 0;
    const refCode = `FI-${String(item.item_id).padStart(4, '0')}`;
    const dateFormatted = new Date(item.found_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const itemJsonStr = escapeHtml(JSON.stringify(item));

    const mediaHtml = item.image_url 
      ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" class="card-img-element" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
         <div class="item-placeholder-graphic" style="display: none;">
           ${getIconSvgForClient(item.category_name, item.title)}
           <span class="item-preview-text">ITEM PREVIEW</span>
           <span class="item-pending-text">Photo pending</span>
         </div>`
      : `<div class="item-placeholder-graphic">
           ${getIconSvgForClient(item.category_name, item.title)}
           <span class="item-preview-text">ITEM PREVIEW</span>
           <span class="item-pending-text">Photo pending</span>
         </div>`;

    return `
      <div 
        class="found-item-card ${isSelected ? 'selected' : ''}" 
        id="card-item-${item.item_id}"
        onclick='selectCardItem(${itemJsonStr}, this)'
      >
        <div class="card-selected-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>

        <div class="card-media-box">
          ${mediaHtml}
        </div>

        <div class="card-content">
          <h3 class="card-item-title">${escapeHtml(item.title)}</h3>
          <span class="card-item-category">${escapeHtml(item.category_name || 'Personal belongings')}</span>

          <div class="card-meta-line">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <span>${escapeHtml(item.location_name || 'Campus Grounds')}</span>
          </div>

          <div class="card-footer-meta">
            <div class="card-meta-line">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              <span>${dateFormatted}</span>
            </div>
            <span class="card-ref-code">${refCode}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Automatically select the first item and sync the right details panel
  if (items[0]) {
    selectCardItem(items[0], document.getElementById(`card-item-${items[0].item_id}`));
  }
}

// ── 3. SVG Icon Helper for Dynamic Clientside Rendering ────────────────────
function getIconSvgForClient(categoryName = '', title = '') {
  const combined = `${categoryName} ${title}`.toLowerCase();

  if (combined.includes('bottle') || combined.includes('flask') || combined.includes('tumbler')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 2h4v3h-4zM9 5h6a1 1 0 0 1 1 1v2a3 3 0 0 1-1 2.2V20a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-9.8A3 3 0 0 1 8 8V6a1 1 0 0 1 1-1z"/></svg>`;
  }
  if (combined.includes('backpack') || combined.includes('bag') || combined.includes('purse')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="8" width="16" height="14" rx="4"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/><line x1="9" y1="13" x2="15" y2="13"/></svg>`;
  }
  if (combined.includes('headphone') || combined.includes('audio') || combined.includes('earphone')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`;
  }
  if (combined.includes('umbrella')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/></svg>`;
  }
  if (combined.includes('calculator') || combined.includes('math')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></svg>`;
  }
  if (combined.includes('key')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`;
  }
  if (combined.includes('id') || combined.includes('card') || combined.includes('document')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><line x1="15" y1="8" x2="17" y2="8"/><line x1="15" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/></svg>`;
  }
  if (combined.includes('notebook') || combined.includes('book') || combined.includes('spiral')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10M6 14h6"/><path d="m18 13 4-4"/></svg>`;
  }
  if (combined.includes('glass') || combined.includes('eyewear') || combined.includes('prescription')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="6" cy="15" r="4"/><circle cx="18" cy="15" r="4"/><path d="M14 15a2 2 0 0 0-4 0"/><path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2h8c1.6 0 2.3.7 3 2l2.5 6"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
}

// ── 4. Claim Modal Actions ─────────────────────────────────────────────────
function openClaimModalFromSide() {
  const dialog = document.getElementById('claim-modal-dialog');
  if (!dialog) return;

  const claimItemId = document.getElementById('claim-item-id');
  if (!claimItemId || !claimItemId.value) {
    showToast('Please click on an item first to claim it.', 'error');
    return;
  }

  dialog.showModal();
}

function closeClaimModal() {
  const dialog = document.getElementById('claim-modal-dialog');
  if (dialog) dialog.close();
}

async function submitPublicClaim(e) {
  e.preventDefault();

  const itemId = Number(document.getElementById('claim-item-id').value);
  const claimantName = document.getElementById('claimant-name').value.trim();
  const claimantEmail = document.getElementById('claimant-email').value.trim() || null;
  const claimantPhone = document.getElementById('claimant-phone').value.trim() || null;
  const proofDescription = document.getElementById('claim-proof-description').value.trim();

  if (!claimantEmail && !claimantPhone) {
    showToast('Please provide at least an email or phone number for verification contact.', 'error');
    return;
  }

  const submitBtn = document.getElementById('btn-submit-claim-modal');
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/v1/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId,
        claimant_name: claimantName,
        claimant_email: claimantEmail,
        claimant_phone: claimantPhone,
        proof_description: proofDescription,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error?.message || 'Failed to submit claim');
    }

    closeClaimModal();
    showToast('Claim submitted! Security officers have received your verification request.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

// ── 5. Staff & Admin Login Modal ───────────────────────────────────────────
function openLoginModal() {
  const dialog = document.getElementById('login-modal-dialog');
  if (dialog) {
    const form = document.getElementById('modal-login-form');
    if (form) form.reset();
    dialog.showModal();
  } else {
    window.location.href = '/login';
  }
}

function closeLoginModal() {
  const dialog = document.getElementById('login-modal-dialog');
  if (dialog) dialog.close();
}

async function handleModalLogin(e) {
  e.preventDefault();

  const email = document.getElementById('modal-login-email').value.trim();
  const password = document.getElementById('modal-login-password').value;
  const submitBtn = document.getElementById('btn-modal-login-submit');

  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error?.message || 'Invalid credentials');
    }

    showToast('Authorized! Redirecting to Add Item...', 'success');
    setTimeout(() => {
      window.location.href = '/admin/found-items/new';
    }, 600);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

function openClaimGuideModal() {
  const dialog = document.getElementById('claim-guide-dialog');
  if (dialog) dialog.showModal();
}

function closeClaimGuideModal() {
  const dialog = document.getElementById('claim-guide-dialog');
  if (dialog) dialog.close();
}

function openSystemAboutModal() {
  const dialog = document.getElementById('about-system-dialog');
  if (dialog) dialog.showModal();
}

function scrollToClaimHint() {
  const card = document.querySelector('.sidebar-footer-card');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth' });
    card.style.borderColor = '#0891B2';
    setTimeout(() => {
      card.style.borderColor = '#E2E8F0';
    }, 1500);
  }
}

// ── 6. Toast Utilities ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error:   `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
    info:    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
  };
  const titles = { success: 'Success', error: 'Error', info: 'Notice' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <div class="toast-icon-wrap">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${titles[type] || 'Notice'}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close-btn" onclick="this.closest('.toast').remove()" aria-label="Dismiss">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => toast.remove(), 280);
  }, 5000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Close dialogs when clicking backdrop
document.querySelectorAll('dialog.institutional-dialog, dialog.custom-dialog').forEach((dialog) => {
  dialog.addEventListener('click', (e) => {
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      dialog.close();
    }
  });
});

// ── 7. Staff & Admin Dashboard Tab Navigation ──────────────────────────────
function switchDashboardTab(tabName) {
  // Update Tab Buttons
  document.querySelectorAll('.dashboard-tabs .tab-btn').forEach((btn) => {
    btn.classList.remove('active');
  });
  const targetBtn = document.getElementById(`tab-btn-${tabName}`);
  if (targetBtn) targetBtn.classList.add('active');

  // Update Sidebar Links
  document.querySelectorAll('.admin-nav-menu .admin-nav-item').forEach((link) => {
    link.classList.remove('active');
  });
  const sideLink = document.getElementById(`side-link-${tabName}`);
  if (sideLink) sideLink.classList.add('active');

  // Keep the mobile navigation selection in sync with the active dashboard tab.
  document.querySelectorAll('.mobile-bottom-tab-bar .mob-tab-item').forEach((link) => {
    link.classList.remove('active');
    link.removeAttribute('aria-current');
  });
  const mobileTab = document.getElementById(`mob-tab-${tabName}`);
  if (mobileTab) {
    mobileTab.classList.add('active');
    mobileTab.setAttribute('aria-current', 'page');
  }

  // Update Topbar Breadcrumb Text
  const breadcrumb = document.getElementById('topbar-breadcrumb-title');
  if (breadcrumb) {
    const titles = {
      items: 'Item Inventory',
      claims: 'Claims Verification',
      audit: 'Audit Trail',
    };
    breadcrumb.textContent = titles[tabName] || 'Item Inventory';
  }

  // Update Tab Panels
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.add('hidden');
    panel.classList.remove('active');
  });
  const targetPanel = document.getElementById(`tab-panel-${tabName}`);
  if (targetPanel) {
    targetPanel.classList.remove('hidden');
    targetPanel.classList.add('active');
  }

  // Update URL query parameter without full reload
  if (window.history && window.history.replaceState) {
    const newUrl = `${window.location.pathname}?tab=${tabName}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  }

  if (tabName === 'items') {
    runStaffInventoryFilter();
  } else if (tabName === 'claims') {
    filterStaffClaims();
  } else if (tabName === 'audit') {
    filterStaffAuditLogs();
  }
}

// ── 8. Table Search, Filtering & Pagination ──────────────────────────────────
let invCurrentPage = 1;
let invPageSize = 5;

function filterStaffInventory(query) {
  const searchInput = document.getElementById('staff-item-search');
  if (searchInput && query !== undefined && searchInput.value !== query) {
    searchInput.value = query;
  }
  invCurrentPage = 1;
  runStaffInventoryFilter();
}

function runStaffInventoryFilter() {
  const query = (document.getElementById('staff-item-search')?.value || '').toLowerCase().trim();
  const category = (document.getElementById('staff-item-category-filter')?.value || 'all').toLowerCase().trim();
  const status = (document.getElementById('staff-item-status-filter')?.value || 'all').toLowerCase().trim();

  const allRows = document.querySelectorAll('#staff-items-table tbody tr');
  const matchedRows = [];

  allRows.forEach((row) => {
    if (!row.getAttribute('data-id')) return;

    const id = row.getAttribute('data-id') || '';
    const title = row.getAttribute('data-title') || '';
    const cat = row.getAttribute('data-category') || '';
    const rowStatus = row.getAttribute('data-status') || '';
    const serial = row.getAttribute('data-serial') || '';
    const finder = row.getAttribute('data-finder') || '';
    const text = row.innerText.toLowerCase();

    const matchesQuery = !query || 
      title.includes(query) || 
      cat.includes(query) || 
      serial.includes(query) || 
      finder.includes(query) || 
      id.includes(query) || 
      text.includes(query);

    const matchesCategory = category === 'all' || cat === category;
    const matchesStatus = status === 'all' || rowStatus === status;

    if (matchesQuery && matchesCategory && matchesStatus) {
      matchedRows.push(row);
    } else {
      row.style.display = 'none';
    }
  });

  const totalMatches = matchedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / invPageSize));

  if (invCurrentPage > totalPages) {
    invCurrentPage = totalPages;
  }
  if (invCurrentPage < 1) {
    invCurrentPage = 1;
  }

  const startIndex = (invCurrentPage - 1) * invPageSize;
  const endIndex = Math.min(startIndex + invPageSize, totalMatches);

  matchedRows.forEach((row, idx) => {
    if (idx >= startIndex && idx < endIndex) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });

  // Empty state handling
  const noResultsRow = document.getElementById('inventory-no-results-row');
  if (noResultsRow) {
    noResultsRow.style.display = totalMatches === 0 ? '' : 'none';
  }

  // Counter badge at top
  const counterEl = document.getElementById('inventory-results-counter');
  if (counterEl) {
    counterEl.textContent = `Showing ${totalMatches} items`;
  }

  // Pagination info at bottom
  const startEl = document.getElementById('inv-page-start');
  const endEl = document.getElementById('inv-page-end');
  const totalEl = document.getElementById('inv-page-total');
  if (startEl && endEl && totalEl) {
    startEl.textContent = totalMatches === 0 ? '0' : String(startIndex + 1);
    endEl.textContent = String(endIndex);
    totalEl.textContent = String(totalMatches);
  }

  renderInventoryPaginationButtons(totalPages, totalMatches);
}

function renderInventoryPaginationButtons(totalPages, totalMatches) {
  const prevBtn = document.getElementById('inv-btn-prev');
  const nextBtn = document.getElementById('inv-btn-next');
  const numbersContainer = document.getElementById('inventory-page-numbers');

  if (prevBtn) {
    prevBtn.disabled = invCurrentPage <= 1 || totalMatches === 0;
  }
  if (nextBtn) {
    nextBtn.disabled = invCurrentPage >= totalPages || totalMatches === 0;
  }

  if (!numbersContainer) return;
  numbersContainer.innerHTML = '';

  if (totalMatches === 0) {
    const emptyBtn = document.createElement('button');
    emptyBtn.type = 'button';
    emptyBtn.className = 'page-num-btn active';
    emptyBtn.textContent = '1';
    emptyBtn.disabled = true;
    numbersContainer.appendChild(emptyBtn);
    return;
  }

  for (let p = 1; p <= totalPages; p++) {
    // Show first, last, current, and adjacent neighbours
    if (
      p === 1 || 
      p === totalPages || 
      (p >= invCurrentPage - 1 && p <= invCurrentPage + 1)
    ) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-num-btn ${p === invCurrentPage ? 'active' : ''}`;
      btn.textContent = String(p);
      btn.onclick = () => goToInventoryPage(p);
      numbersContainer.appendChild(btn);
    } else if (
      (p === invCurrentPage - 2 && p > 1) || 
      (p === invCurrentPage + 2 && p < totalPages)
    ) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'page-ellipsis';
      ellipsis.textContent = '…';
      numbersContainer.appendChild(ellipsis);
    }
  }
}

function goToInventoryPage(page) {
  invCurrentPage = page;
  runStaffInventoryFilter();
  const table = document.getElementById('staff-items-table');
  if (table) {
    table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function changeInventoryPageSize(newSize) {
  invPageSize = parseInt(newSize, 10) || 5;
  invCurrentPage = 1;
  runStaffInventoryFilter();
}

function resetStaffInventoryFilters() {
  const searchInput = document.getElementById('staff-item-search');
  const catFilter = document.getElementById('staff-item-category-filter');
  const statusFilter = document.getElementById('staff-item-status-filter');

  if (searchInput) searchInput.value = '';
  if (catFilter) catFilter.value = 'all';
  if (statusFilter) statusFilter.value = 'all';

  invCurrentPage = 1;
  runStaffInventoryFilter();
}

let currentClaimFilterStatus = 'all';
let claimsCurrentPage = 1;
let claimsPageSize = 5;

function setClaimFilter(status, btnEl) {
  currentClaimFilterStatus = status;
  const pillBtns = document.querySelectorAll('.filter-pill-selector .filter-pill-btn');
  pillBtns.forEach((btn) => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  claimsCurrentPage = 1;
  filterStaffClaims();
}

function filterClaimsByStatus(status) {
  const targetBtn = document.querySelector(`.filter-pill-btn[data-filter="${status}"]`);
  setClaimFilter(status, targetBtn);
}

function filterStaffClaims() {
  const query = (document.getElementById('staff-claim-search')?.value || '').toLowerCase().trim();
  const status = currentClaimFilterStatus;

  const allRows = document.querySelectorAll('#staff-claims-table tbody tr');
  const matchedRows = [];

  allRows.forEach((row) => {
    if (!row.getAttribute('data-id')) return;

    const rowStatus = row.getAttribute('data-status') || '';
    const claimant = row.getAttribute('data-claimant') || '';
    const item = row.getAttribute('data-item') || '';
    const ref = row.getAttribute('data-ref') || '';
    const clm = row.getAttribute('data-clm') || '';
    const text = row.innerText.toLowerCase();

    const matchesQuery = !query ||
      claimant.includes(query) ||
      item.includes(query) ||
      ref.includes(query) ||
      clm.includes(query) ||
      text.includes(query);

    const matchesStatus = status === 'all' || rowStatus === status;

    if (matchesQuery && matchesStatus) {
      matchedRows.push(row);
    } else {
      row.style.display = 'none';
    }
  });

  const totalMatches = matchedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / claimsPageSize));

  if (claimsCurrentPage > totalPages) {
    claimsCurrentPage = totalPages;
  }
  if (claimsCurrentPage < 1) {
    claimsCurrentPage = 1;
  }

  const startIndex = (claimsCurrentPage - 1) * claimsPageSize;
  const endIndex = Math.min(startIndex + claimsPageSize, totalMatches);

  matchedRows.forEach((row, idx) => {
    if (idx >= startIndex && idx < endIndex) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });

  const noResultsRow = document.getElementById('claims-no-results-row');
  if (noResultsRow) {
    noResultsRow.style.display = totalMatches === 0 ? '' : 'none';
  }

  const counterEl = document.getElementById('claims-results-counter');
  if (counterEl) {
    if (status === 'all') {
      counterEl.textContent = `Showing ${totalMatches} claims`;
    } else if (status === 'pending') {
      counterEl.textContent = `${totalMatches} Pending Verification`;
    } else if (status === 'accepted') {
      counterEl.textContent = `${totalMatches} Approved`;
    } else if (status === 'rejected') {
      counterEl.textContent = `${totalMatches} Rejected`;
    }
  }

  const startEl = document.getElementById('claims-page-start');
  const endEl = document.getElementById('claims-page-end');
  const totalEl = document.getElementById('claims-page-total');
  if (startEl && endEl && totalEl) {
    startEl.textContent = totalMatches === 0 ? '0' : String(startIndex + 1);
    endEl.textContent = String(endIndex);
    totalEl.textContent = String(totalMatches);
  }

  renderClaimsPaginationButtons(totalPages, totalMatches);
}

function renderClaimsPaginationButtons(totalPages, totalMatches) {
  const prevBtn = document.getElementById('claims-btn-prev');
  const nextBtn = document.getElementById('claims-btn-next');
  const numbersContainer = document.getElementById('claims-page-numbers');

  if (prevBtn) {
    prevBtn.disabled = claimsCurrentPage <= 1 || totalMatches === 0;
  }
  if (nextBtn) {
    nextBtn.disabled = claimsCurrentPage >= totalPages || totalMatches === 0;
  }

  if (!numbersContainer) return;
  numbersContainer.innerHTML = '';

  if (totalMatches === 0) {
    const emptyBtn = document.createElement('button');
    emptyBtn.type = 'button';
    emptyBtn.className = 'page-num-btn active';
    emptyBtn.textContent = '1';
    emptyBtn.disabled = true;
    numbersContainer.appendChild(emptyBtn);
    return;
  }

  for (let p = 1; p <= totalPages; p++) {
    if (
      p === 1 ||
      p === totalPages ||
      (p >= claimsCurrentPage - 1 && p <= claimsCurrentPage + 1)
    ) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-num-btn ${p === claimsCurrentPage ? 'active' : ''}`;
      btn.textContent = String(p);
      btn.onclick = () => goToClaimsPage(p);
      numbersContainer.appendChild(btn);
    } else if (
      (p === claimsCurrentPage - 2 && p > 1) ||
      (p === claimsCurrentPage + 2 && p < totalPages)
    ) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'page-ellipsis';
      ellipsis.textContent = '…';
      numbersContainer.appendChild(ellipsis);
    }
  }
}

function goToClaimsPage(page) {
  claimsCurrentPage = page;
  filterStaffClaims();
  const table = document.getElementById('staff-claims-table');
  if (table) {
    table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function changeClaimsPageSize(newSize) {
  claimsPageSize = parseInt(newSize, 10) || 5;
  claimsCurrentPage = 1;
  filterStaffClaims();
}

let auditCurrentPage = 1;
let auditPageSize = 10;

function filterStaffAuditLogs(query) {
  const searchInput = document.getElementById('staff-audit-search');
  const q = (query !== undefined ? query : (searchInput?.value || '')).toLowerCase().trim();

  const allRows = document.querySelectorAll('#staff-audit-table tbody tr');
  const matchedRows = [];

  allRows.forEach((row) => {
    if (row.id === 'audit-no-results-row') return;
    if (!row.getAttribute('data-action')) return;

    const action = row.getAttribute('data-action') || '';
    const actor = row.getAttribute('data-actor') || '';
    const text = row.innerText.toLowerCase();

    if (!q || action.includes(q) || actor.includes(q) || text.includes(q)) {
      matchedRows.push(row);
    } else {
      row.style.display = 'none';
    }
  });

  const totalMatches = matchedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / auditPageSize));

  if (auditCurrentPage > totalPages) {
    auditCurrentPage = totalPages;
  }
  if (auditCurrentPage < 1) {
    auditCurrentPage = 1;
  }

  const startIndex = (auditCurrentPage - 1) * auditPageSize;
  const endIndex = Math.min(startIndex + auditPageSize, totalMatches);

  matchedRows.forEach((row, idx) => {
    if (idx >= startIndex && idx < endIndex) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });

  const noResultsRow = document.getElementById('audit-no-results-row');
  if (noResultsRow) {
    noResultsRow.style.display = totalMatches === 0 ? '' : 'none';
  }

  const startEl = document.getElementById('audit-page-start');
  const endEl = document.getElementById('audit-page-end');
  const totalEl = document.getElementById('audit-page-total');
  if (startEl && endEl && totalEl) {
    startEl.textContent = totalMatches === 0 ? '0' : String(startIndex + 1);
    endEl.textContent = String(endIndex);
    totalEl.textContent = String(totalMatches);
  }

  renderAuditPaginationButtons(totalPages, totalMatches);
}

function renderAuditPaginationButtons(totalPages, totalMatches) {
  const prevBtn = document.getElementById('audit-btn-prev');
  const nextBtn = document.getElementById('audit-btn-next');
  const numbersContainer = document.getElementById('audit-page-numbers');

  if (prevBtn) {
    prevBtn.disabled = auditCurrentPage <= 1 || totalMatches === 0;
  }
  if (nextBtn) {
    nextBtn.disabled = auditCurrentPage >= totalPages || totalMatches === 0;
  }

  if (!numbersContainer) return;
  numbersContainer.innerHTML = '';

  if (totalMatches === 0) {
    const emptyBtn = document.createElement('button');
    emptyBtn.type = 'button';
    emptyBtn.className = 'page-num-btn active';
    emptyBtn.textContent = '1';
    emptyBtn.disabled = true;
    numbersContainer.appendChild(emptyBtn);
    return;
  }

  for (let p = 1; p <= totalPages; p++) {
    if (
      p === 1 ||
      p === totalPages ||
      (p >= auditCurrentPage - 1 && p <= auditCurrentPage + 1)
    ) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `page-num-btn ${p === auditCurrentPage ? 'active' : ''}`;
      btn.textContent = String(p);
      btn.onclick = () => goToAuditPage(p);
      numbersContainer.appendChild(btn);
    } else if (
      (p === auditCurrentPage - 2 && p > 1) ||
      (p === auditCurrentPage + 2 && p < totalPages)
    ) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'page-ellipsis';
      ellipsis.textContent = '…';
      numbersContainer.appendChild(ellipsis);
    }
  }
}

function goToAuditPage(page) {
  auditCurrentPage = page;
  filterStaffAuditLogs();
  const table = document.getElementById('staff-audit-table');
  if (table) {
    table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function changeAuditPageSize(newSize) {
  auditPageSize = parseInt(newSize, 10) || 10;
  auditCurrentPage = 1;
  filterStaffAuditLogs();
}

// ── 9. Item Modals (Log New & Edit) ─────────────────────────────────────────
function openNewItemModal() {
  const dialog = document.getElementById('log-item-dialog');
  if (dialog) dialog.showModal();
}

function closeNewItemModal() {
  const dialog = document.getElementById('log-item-dialog');
  if (dialog) dialog.close();
}

async function submitNewItem(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById('btn-submit-new-item');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  if (submitBtn) submitBtn.disabled = true;

  try {
    let imageUrl = form.image_url ? form.image_url.value.trim() || null : null;
    const hasImageFile = form.image_file && form.image_file.files && form.image_file.files[0];

    if (!imageUrl && !hasImageFile) {
      showToast('Please upload a photograph or provide an image URL. Item photo is required.', 'error');
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    // Check if user selected an image file
    if (hasImageFile) {
      if (btnText) btnText.textContent = 'Uploading photo...';
      const imgFormData = new FormData();
      imgFormData.append('image', form.image_file.files[0]);

      const uploadRes = await fetch('/api/v1/items/upload', {
        method: 'POST',
        body: imgFormData,
      });

      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadJson.error?.message || uploadJson.message || 'Image upload failed');
      }
      imageUrl = uploadJson.data?.imageUrl || null;
    }

    if (btnText) btnText.textContent = 'Recording in custody...';

    const payload = {
      title: form.title.value.trim(),
      category_id: form.category_id.value ? Number(form.category_id.value) : null,
      location_id: form.location_id.value ? Number(form.location_id.value) : null,
      found_at: form.found_at.value ? new Date(form.found_at.value).toISOString() : new Date().toISOString(),
      finder_name: form.finder_name.value.trim(),
      finder_contact: form.finder_contact ? form.finder_contact.value.trim() : null,
      description: form.description ? form.description.value.trim() : null,
      serial_number: form.serial_number ? form.serial_number.value.trim() || null : null,
      storage_notes: form.storage_notes ? form.storage_notes.value.trim() : null,
      image_url: imageUrl,
    };

    const res = await fetch('/api/v1/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || json.message || 'Failed to record found item');

    const itemCode = `#FI-0${json.data?.item_id || ''}`;
    showToast(`Found item ${itemCode} successfully stored into inventory!`, 'success');
    closeNewItemModal();
    setTimeout(() => {
      window.location.href = '/dashboard?tab=items';
    }, 600);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Record in Custody';
    }
  }
}

function openEditItemModal(item) {
  const dialog = document.getElementById('edit-item-dialog');
  if (!dialog) return;

  const idField = document.getElementById('edit-item-id');
  const titleField = document.getElementById('edit-item-title');
  const catField = document.getElementById('edit-item-category');
  const locField = document.getElementById('edit-item-location');
  const statusField = document.getElementById('edit-item-status');
  const descField = document.getElementById('edit-item-desc');
  const serialField = document.getElementById('edit-item-serial-number');
  const storageField = document.getElementById('edit-item-storage-notes');

  if (idField) idField.value = item.item_id;
  if (titleField) titleField.value = item.title || '';
  if (catField) catField.value = item.category_id || '';
  if (locField) locField.value = item.location_id || '';
  
  if (statusField) {
    const isProc = item.storage_notes && item.storage_notes.toLowerCase().includes('processing');
    const isClaimed = item.item_status === 'inactive' || (item.storage_notes && item.storage_notes.toLowerCase().includes('claimed'));
    statusField.value = isProc ? 'processing' : (isClaimed ? 'claimed' : 'stored');
  }

  if (descField) descField.value = item.description || '';
  if (serialField) serialField.value = item.serial_number || '';
  
  if (storageField) {
    let cleanNotes = item.storage_notes || '';
    cleanNotes = cleanNotes.replace(/^Status:\s*(Stored|Processing|Claimed|Active)(\s*-\s*)?/i, '').trim();
    storageField.value = cleanNotes;
  }

  dialog.showModal();
}

function closeEditItemModal() {
  const dialog = document.getElementById('edit-item-dialog');
  if (dialog) dialog.close();
}

async function submitEditItem(e) {
  e.preventDefault();
  const form = e.target;
  const itemId = document.getElementById('edit-item-id').value;
  const submitBtn = document.getElementById('btn-submit-edit-item');
  if (submitBtn) submitBtn.disabled = true;

  const chosenStatus = form.item_status.value;
  const isClaimed = chosenStatus === 'claimed';
  const dbStatus = isClaimed ? 'inactive' : 'active';

  let notes = form.storage_notes ? form.storage_notes.value.trim() : '';
  notes = notes.replace(/^Status:\s*(Stored|Processing|Claimed|Active)(\s*-\s*)?/i, '').trim();

  let tag = 'Stored';
  if (chosenStatus === 'processing') tag = 'Processing';
  else if (chosenStatus === 'claimed') tag = 'Claimed';
  else tag = 'Stored';

  const finalStorageNotes = notes ? `Status: ${tag} - ${notes}` : `Status: ${tag}`;

  const payload = {
    title: form.title.value.trim(),
    category_id: form.category_id.value ? Number(form.category_id.value) : null,
    location_id: form.location_id.value ? Number(form.location_id.value) : null,
    item_status: dbStatus,
    description: form.description ? form.description.value.trim() || null : null,
    serial_number: form.serial_number ? form.serial_number.value.trim() || null : null,
    storage_notes: finalStorageNotes,
  };

  try {
    const res = await fetch(`/api/v1/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Failed to update item record');

    showToast('Item record successfully updated with audit snapshot.', 'success');
    closeEditItemModal();
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function archiveItemHandler(itemId) {
  if (!confirm(`Are you sure you want to soft-archive Item #${itemId}? This action is permanent and transactionally audited (Zero Physical Deletes).`)) {
    return;
  }

  try {
    const res = await fetch(`/api/v1/items/${itemId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Failed to archive item');

    showToast(`Item #${itemId} successfully soft-archived.`, 'success');
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── 10. Claim Review Queue ──────────────────────────────────────────────────
let activeReviewClaim = null;

function openReviewClaimModal(claim) {
  activeReviewClaim = claim;
  const dialog = document.getElementById('review-claim-dialog');
  if (!dialog) return;

  const claimIdEl = document.getElementById('modal-review-claim-id');
  const itemCodeEl = document.getElementById('modal-claim-item-code');
  const titleEl = document.getElementById('modal-claim-item-title');
  const dateEl = document.getElementById('modal-claim-date');
  const nameEl = document.getElementById('modal-claim-claimant-name');
  const emailEl = document.getElementById('modal-claim-email');
  const phoneEl = document.getElementById('modal-claim-phone');
  const custodyEl = document.getElementById('modal-claim-custody-text');
  const proofEl = document.getElementById('modal-claim-proof');
  const statusBadgeContainer = document.getElementById('modal-review-claim-status-badge');
  const statusEl = document.getElementById('modal-review-claim-status');

  const approveBtn = document.getElementById('btn-approve-claim');
  const rejectBtn = document.getElementById('btn-reject-claim');

  if (claimIdEl) claimIdEl.textContent = `#CLM-${String(claim.claim_id).padStart(4, '0')}`;
  if (itemCodeEl) itemCodeEl.textContent = `REF: #FI-${String(claim.item_id).padStart(4, '0')}`;
  if (titleEl) titleEl.textContent = claim.item_title || `Item #${claim.item_id}`;
  if (nameEl) nameEl.textContent = claim.claimant_name;
  if (emailEl) emailEl.textContent = claim.claimant_email || 'Not provided';
  if (phoneEl) phoneEl.textContent = claim.claimant_phone || 'Not provided';
  if (proofEl) proofEl.textContent = claim.proof_description || 'No detailed proof submitted.';

  if (dateEl && claim.created_at) {
    try {
      dateEl.textContent = new Date(claim.created_at).toLocaleDateString('en-US', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      dateEl.textContent = claim.created_at;
    }
  }

  const claimStatus = (claim.claim_status || 'pending').toLowerCase();
  if (statusBadgeContainer) {
    if (claimStatus === 'pending') {
      statusBadgeContainer.innerHTML = `
        <span class="status-pill-subtle pending-verification" id="modal-review-claim-status">
          <span class="pulse-dot-amber"></span>
          <span>Pending Verification</span>
        </span>
      `;
    } else if (claimStatus === 'accepted') {
      statusBadgeContainer.innerHTML = `
        <span class="status-pill-subtle accepted-claim" id="modal-review-claim-status">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Approved</span>
        </span>
      `;
    } else if (claimStatus === 'rejected') {
      statusBadgeContainer.innerHTML = `
        <span class="status-pill-subtle rejected-claim" id="modal-review-claim-status">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          <span>Rejected</span>
        </span>
      `;
    } else if (statusEl) {
      statusEl.textContent = claimStatus.toUpperCase();
    }
  } else if (statusEl) {
    statusEl.textContent = claimStatus.toUpperCase();
  }

  if (custodyEl) {
    if (claimStatus === 'pending') {
      custodyEl.textContent = 'Pending Verification';
      custodyEl.style.color = '#B45309';
    } else if (claimStatus === 'accepted') {
      custodyEl.textContent = 'Approved & Released';
      custodyEl.style.color = '#15803D';
    } else if (claimStatus === 'rejected') {
      custodyEl.textContent = 'Claim Rejected';
      custodyEl.style.color = '#B91C1C';
    } else {
      custodyEl.textContent = claimStatus;
      custodyEl.style.color = '#0F172A';
    }
  }

  // Toggle action buttons based on pending status
  const isPending = claimStatus === 'pending';
  if (approveBtn) approveBtn.style.display = isPending ? 'inline-flex' : 'none';
  if (rejectBtn) rejectBtn.style.display = isPending ? 'inline-flex' : 'none';

  dialog.showModal();
}

function closeReviewClaimModal() {
  const dialog = document.getElementById('review-claim-dialog');
  if (dialog) dialog.close();
  activeReviewClaim = null;
}

async function submitClaimDecision(decision) {
  if (!activeReviewClaim) return;

  const notes = '';
  const approveBtn = document.getElementById('btn-approve-claim');
  const rejectBtn = document.getElementById('btn-reject-claim');

  if (approveBtn) approveBtn.disabled = true;
  if (rejectBtn) rejectBtn.disabled = true;

  try {
    const res = await fetch(`/api/v1/claims/${activeReviewClaim.claim_id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: decision,
        notes: notes || `Marked as ${decision} during verification at Security Office.`,
      }),
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || `Failed to mark claim as ${decision}`);

    showToast(`Claim #${activeReviewClaim.claim_id} marked as ${decision.toUpperCase()}!`, 'success');
    closeReviewClaimModal();
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (approveBtn) approveBtn.disabled = false;
    if (rejectBtn) rejectBtn.disabled = false;
  }
}

// ── 11. In-Person Claim & Credential Verification Handler ───────────────────
let activeInPersonItem = null;

function openInPersonClaimModal(item) {
  activeInPersonItem = item;
  const dialog = document.getElementById('in-person-claim-dialog');
  if (!dialog) return;

  const idInput = document.getElementById('in-person-item-id');
  const summaryEl = document.getElementById('in-person-item-summary');
  const refEl = document.getElementById('in-person-item-ref');
  const form = document.getElementById('in-person-claim-form');

  if (form) form.reset();
  if (idInput) idInput.value = item.item_id;
  if (summaryEl) summaryEl.textContent = item.title;
  if (refEl) refEl.textContent = `Asset Code: #FI-${String(item.item_id).padStart(4, '0')} · Found: ${item.location_name || 'Campus'}`;

  // Pre-fill notes template
  const proofText = document.getElementById('in-person-verification-proof');
  if (proofText) {
    proofText.value = `Claimant personally presented credentials at Security Desk. Details verified against asset description. Released by Officer on duty.`;
  }

  dialog.showModal();
}

function closeInPersonClaimModal() {
  const dialog = document.getElementById('in-person-claim-dialog');
  if (dialog) dialog.close();
  activeInPersonItem = null;
}

function handleIdTypeChange(type) {
  const numInput = document.getElementById('in-person-id-number');
  if (!numInput) return;
  if (type === 'Device Match & Verification') {
    numInput.placeholder = 'e.g. Passcode / Lockscreen Photo / Face ID matched in presence of guard';
  } else if (type === 'CSPC Student ID') {
    numInput.placeholder = 'e.g. Student ID #2023-10492';
  } else {
    numInput.placeholder = 'e.g. ID card / license / credential reference number';
  }
}

async function submitInPersonClaim(e) {
  e.preventDefault();
  if (!activeInPersonItem) return;

  const submitBtn = document.getElementById('btn-submit-in-person-claim');
  const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.textContent = 'Processing Release...';

  const itemId = Number(document.getElementById('in-person-item-id').value);
  const claimantName = document.getElementById('in-person-claimant-name').value.trim();
  const contact = document.getElementById('in-person-claimant-contact').value.trim();
  const idType = document.getElementById('in-person-id-type').value;
  const idNumber = document.getElementById('in-person-id-number').value.trim();
  const verificationProof = document.getElementById('in-person-verification-proof').value.trim();

  const isEmail = contact.includes('@');
  const claimantEmail = isEmail ? contact : null;
  const claimantPhone = !isEmail ? contact : null;

  const proofDescription = `[In-Person Credential Verification]
ID Type: ${idType}
ID/Ref Number: ${idNumber}
Officer Notes: ${verificationProof}`;

  try {
    // 1. Submit claim record for this item
    const claimRes = await fetch('/api/v1/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId,
        claimant_name: claimantName,
        claimant_email: claimantEmail,
        claimant_phone: claimantPhone,
        proof_description: proofDescription,
      }),
    });

    const claimJson = await claimRes.json();
    if (!claimRes.ok) {
      throw new Error(claimJson.error?.message || claimJson.message || 'Failed to register claim');
    }

    const createdClaim = claimJson.data;

    // 2. Immediately approve the claim (since claimant is physically verified by guard)
    const reviewRes = await fetch(`/api/v1/claims/${createdClaim.claim_id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'accepted',
        notes: `In-person verification approved: ${idType} (${idNumber}). Item handed over to claimant ${claimantName}.`,
      }),
    });

    const reviewJson = await reviewRes.json();
    if (!reviewRes.ok) {
      throw new Error(reviewJson.error?.message || reviewJson.message || 'Failed to approve claim');
    }

    showToast(`Success! Item #${itemId} claimed and custody released to ${claimantName}.`, 'success');
    closeInPersonClaimModal();
    setTimeout(() => {
      window.location.href = '/dashboard?tab=items';
    }, 700);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      if (btnText) btnText.textContent = 'Verify Credential & Release Item';
    }
  }
}

// ── 12. Item Photograph Lightbox / Modal Preview ────────────────────────────
function openThumbPreview(el) {
  if (!el) return;
  const imgUrl = el.getAttribute('data-img');
  const title = el.getAttribute('data-title');
  const refCode = el.getAttribute('data-ref');
  openItemImagePreview(imgUrl, title, refCode);
}

function openItemImagePreview(imageUrl, title, refCode) {
  if (!imageUrl) return;
  const dialog = document.getElementById('image-preview-dialog');
  const imgEl = document.getElementById('preview-modal-img');
  const captionEl = document.getElementById('preview-modal-caption');
  const refEl = document.getElementById('preview-modal-ref');

  if (imgEl) imgEl.src = imageUrl;
  if (captionEl) captionEl.textContent = title || 'Item Photograph';
  if (refEl) refEl.textContent = refCode || '#FI-XXXX';

  if (dialog && typeof dialog.showModal === 'function') {
    dialog.showModal();
  }
}

function closeItemImagePreview() {
  const dialog = document.getElementById('image-preview-dialog');
  if (dialog && typeof dialog.close === 'function') {
    dialog.close();
  }
}
