// Settings controller for settings.html protected panel
import { initAuthGuard } from './auth.js';
import { saveRestaurantSettings, getRestaurantSettings } from './db.js';
import { showAlert } from './utils.js';

let activeUser = null;
let activeRestaurant = null;
let currentLogoBase64 = "";
let enableTracking = true;

const initSettingsPage = async () => {
  const toggleTrackingBtn = document.getElementById('toggle-tracking-btn');
  const updateTrackingBtnUI = () => {
    if (!toggleTrackingBtn) return;
    if (enableTracking) {
      toggleTrackingBtn.style.background = 'var(--primary)';
      toggleTrackingBtn.style.justifyContent = 'flex-end';
    } else {
      toggleTrackingBtn.style.background = 'var(--text-dark)';
      toggleTrackingBtn.style.justifyContent = 'flex-start';
    }
  };

  if (toggleTrackingBtn) {
    toggleTrackingBtn.addEventListener('click', () => {
      enableTracking = !enableTracking;
      updateTrackingBtnUI();
    });
  }

  // Load existing settings and populate the form
  try {
    const settings = await getRestaurantSettings();
    if (settings) {
      const nameEl = document.getElementById('set-rest-name');
      const descEl = document.getElementById('set-rest-desc');
      const currencyEl = document.getElementById('set-rest-currency');
      const slugEl = document.getElementById('set-rest-slug');
      const gstinEl = document.getElementById('set-rest-gstin');
      const stateEl = document.getElementById('set-rest-state');
      const onesignalAppIdEl = document.getElementById('set-onesignal-appid');
      const onesignalRestKeyEl = document.getElementById('set-onesignal-restkey');

      if (nameEl) nameEl.value = settings.name || '';
      if (descEl) descEl.value = settings.description || '';
      if (currencyEl) currencyEl.value = settings.currency || '₹';
      if (slugEl) slugEl.value = settings.slug || '';
      if (gstinEl) gstinEl.value = settings.gstin || '';
      if (stateEl) stateEl.value = settings.stateCode || '27';
      if (onesignalAppIdEl) onesignalAppIdEl.value = settings.onesignalAppId || '';
      if (onesignalRestKeyEl) onesignalRestKeyEl.value = settings.onesignalRestApiKey || '';

      // Show live logo preview if URL exists
      if (settings.logoUrl) {
        currentLogoBase64 = settings.logoUrl;
        renderLogoPreview(settings.logoUrl);
        const filenameLabel = document.getElementById('set-rest-logo-filename');
        if (filenameLabel) {
          filenameLabel.innerText = settings.logoUrl.startsWith('data:') ? 'Stored Image (Base64)' : 'Stored Image (URL)';
        }
      }
      enableTracking = settings.enableTracking !== false;
      updateTrackingBtnUI();
    }
  } catch (err) {
    console.error("Could not load settings:", err);
  }

  // Logo file upload change listener
  const logoFileInput = document.getElementById('set-rest-logo-file');
  const filenameLabel = document.getElementById('set-rest-logo-filename');
  
  if (logoFileInput) {
    logoFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 256000) { // Limit to 250KB
        alert("Image is too large! Please choose an image smaller than 250KB to ensure fast loading times.");
        logoFileInput.value = '';
        return;
      }

      if (filenameLabel) filenameLabel.innerText = file.name;

      const reader = new FileReader();
      reader.onload = (event) => {
        currentLogoBase64 = event.target.result;
        renderLogoPreview(currentLogoBase64);
      };
      reader.readAsDataURL(file);
    });
  }

  // Remove logo button listener
  const removeLogoBtn = document.getElementById('remove-logo-btn');
  if (removeLogoBtn) {
    removeLogoBtn.addEventListener('click', () => {
      currentLogoBase64 = "";
      renderLogoPreview("");
      if (logoFileInput) logoFileInput.value = '';
      if (filenameLabel) filenameLabel.innerText = 'No file uploaded';
    });
  }

  // Settings form submission
  const settingsForm = document.getElementById('settings-form');
  const alertSuccess = document.getElementById('settings-alert-success');
  const alertError = document.getElementById('settings-alert-error');

  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (alertSuccess) alertSuccess.classList.add('hidden');
      if (alertError) alertError.classList.add('hidden');

      const name = document.getElementById('set-rest-name').value.trim();
      const logoUrl = currentLogoBase64;
      const description = document.getElementById('set-rest-desc').value.trim();
      const currency = document.getElementById('set-rest-currency').value.trim();
      const gstin = document.getElementById('set-rest-gstin').value.trim().toUpperCase();
      const stateCode = document.getElementById('set-rest-state').value;
      const onesignalAppId = document.getElementById('set-onesignal-appid').value.trim();
      const onesignalRestApiKey = document.getElementById('set-onesignal-restkey').value.trim();

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const submitBtn = settingsForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerText = 'Saving...';

      try {
        await saveRestaurantSettings({ name, logoUrl, description, currency, slug, gstin, stateCode, enableTracking, onesignalAppId, onesignalRestApiKey });
        if (alertSuccess) {
          alertSuccess.innerText = 'Business settings saved successfully!';
          alertSuccess.classList.remove('hidden');
          setTimeout(() => alertSuccess.classList.add('hidden'), 3500);
        }
      } catch (err) {
        if (alertError) {
          alertError.innerText = 'Failed to save settings: ' + (err.message || 'Unknown error');
          alertError.classList.remove('hidden');
          setTimeout(() => alertError.classList.add('hidden'), 4000);
        }
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Save Business Settings';
      }
    });
  }
};

const renderLogoPreview = (url) => {
  const previewEl = document.getElementById('logo-preview');
  const previewImg = document.getElementById('logo-preview-img');
  if (!previewEl || !previewImg) return;

  if (url) {
    previewImg.src = url;
    previewImg.onerror = () => {
      previewEl.style.display = 'none';
    };
    previewImg.onload = () => {
      previewEl.style.display = 'flex';
    };
  } else {
    previewEl.style.display = 'none';
  }
};

// Execute page initialization guarded by auth credentials check
window.addEventListener('DOMContentLoaded', () => {
  initAuthGuard('settings', (user, restaurant) => {
    activeUser = user;
    activeRestaurant = restaurant;
    initSettingsPage();
  });
});
