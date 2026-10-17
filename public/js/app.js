/**
 * CSPC Lost & Found Portal - Frontend Controller
 * Implements client-side state, card selection, live filtering, and modal dialogs.
 */

// Active selected item in the details panel
let currentSelectedItem = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
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
}

// ── 2. Live Filters & Grid Re-rendering ────────────────────────────────────
async function applyFilters() {
  const categoryId = document.getElementById('filter-category')?.value || '';
  const locationId = document.getElementById('filter-location')?.value || '';
  const search = document.getElementById('catalog-search-input')?.value.trim() || '';

  const params = new URLSearchParams();
  if (categoryId) params.append('category_id', categoryId);
  if (locationId) params.append('location_id', locationId);
  if (search) params.append('search', search);
  params.append('pageSize', '24');

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
    const total = json.meta?.total ?? items.length;

    if (countText) {
      countText.textContent = `Showing 1-${items.length} of ${total} items`;
    }
    if (statBigNumber) {
      statBigNumber.textContent = total;
    }

    renderItemsGrid(items);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    gridContainer.style.opacity = '1';
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

    showToast('Authorized! Redirecting to staff dashboard...', 'success');
    setTimeout(() => {
      window.location.href = '/dashboard';
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

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
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
}

// ── 8. Table Search & Filtering ─────────────────────────────────────────────
function filterStaffInventory(query) {
  const q = (query || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#staff-items-table tbody tr');
  rows.forEach((row) => {
    const title = row.getAttribute('data-title') || '';
    const cat = row.getAttribute('data-category') || '';
    const text = row.innerText.toLowerCase();
    if (!q || title.includes(q) || cat.includes(q) || text.includes(q)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function filterClaimsByStatus(status) {
  const rows = document.querySelectorAll('#staff-claims-table tbody tr');
  rows.forEach((row) => {
    const rowStatus = row.getAttribute('data-status');
    if (status === 'all' || rowStatus === status) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function filterStaffAuditLogs(query) {
  const q = (query || '').toLowerCase().trim();
  const rows = document.querySelectorAll('#staff-audit-table tbody tr');
  rows.forEach((row) => {
    const action = row.getAttribute('data-action') || '';
    const actor = row.getAttribute('data-actor') || '';
    const text = row.innerText.toLowerCase();
    if (!q || action.includes(q) || actor.includes(q) || text.includes(q)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
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

    // Check if user selected an image file
    if (form.image_file && form.image_file.files && form.image_file.files[0]) {
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
  const storageField = document.getElementById('edit-item-storage-notes');

  if (idField) idField.value = item.item_id;
  if (titleField) titleField.value = item.title || '';
  if (catField) catField.value = item.category_id || '';
  if (locField) locField.value = item.location_id || '';
  if (statusField) statusField.value = item.item_status || 'stored';
  if (descField) descField.value = item.description || '';
  if (storageField) storageField.value = item.storage_notes || '';

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

  const payload = {
    title: form.title.value.trim(),
    category_id: form.category_id.value ? Number(form.category_id.value) : null,
    location_id: form.location_id.value ? Number(form.location_id.value) : null,
    item_status: form.item_status.value,
    description: form.description ? form.description.value.trim() : null,
    storage_notes: form.storage_notes ? form.storage_notes.value.trim() : null,
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

  const titleEl = document.getElementById('modal-claim-item-title');
  const nameEl = document.getElementById('modal-claim-claimant-name');
  const emailEl = document.getElementById('modal-claim-email');
  const phoneEl = document.getElementById('modal-claim-phone');
  const proofEl = document.getElementById('modal-claim-proof');
  const statusEl = document.getElementById('modal-review-claim-status');
  const notesEl = document.getElementById('review-claim-notes');

  if (titleEl) titleEl.textContent = claim.item_title || `Item #${claim.item_id}`;
  if (nameEl) nameEl.textContent = claim.claimant_name;
  if (emailEl) emailEl.textContent = claim.claimant_email || 'None';
  if (phoneEl) phoneEl.textContent = claim.claimant_phone || 'None';
  if (proofEl) proofEl.textContent = claim.proof_description || 'No detailed proof submitted.';
  if (statusEl) statusEl.textContent = (claim.claim_status || 'Pending').toUpperCase();
  if (notesEl) notesEl.value = '';

  dialog.showModal();
}

function closeReviewClaimModal() {
  const dialog = document.getElementById('review-claim-dialog');
  if (dialog) dialog.close();
  activeReviewClaim = null;
}

async function submitClaimDecision(decision) {
  if (!activeReviewClaim) return;

  const notes = document.getElementById('review-claim-notes').value.trim();
  const approveBtn = document.getElementById('btn-approve-claim');
  const rejectBtn = document.getElementById('btn-reject-claim');

  if (approveBtn) approveBtn.disabled = true;
  if (rejectBtn) rejectBtn.disabled = true;

  try {
    const res = await fetch(`/api/v1/claims/${activeReviewClaim.claim_id}`, {
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

