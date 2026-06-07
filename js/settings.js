// Settings controller for settings.html protected panel
import { initAuthGuard } from './auth.js';
import { saveRestaurantSettings, getRestaurantSettings } from './db.js';
import { showAlert } from './utils.js';

let activeUser = null;
let activeRestaurant = null;

const initSettingsPage = async () => {
  // Load existing settings and populate the form
  try {
    const settings = await getRestaurantSettings();
    if (settings) {
      const nameEl = document.getElementById('set-rest-name');
      const logoEl = document.getElementById('set-rest-logo');
      const descEl = document.getElementById('set-rest-desc');
      const currencyEl = document.getElementById('set-rest-currency');
      const slugEl = document.getElementById('set-rest-slug');

      if (nameEl) nameEl.value = settings.name || '';
      if (logoEl) logoEl.value = settings.logoUrl || '';
      if (descEl) descEl.value = settings.description || '';
      if (currencyEl) currencyEl.value = settings.currency || '₹';
      if (slugEl) slugEl.value = settings.slug || '';

      // Show live logo preview if URL exists
      if (settings.logoUrl) {
        renderLogoPreview(settings.logoUrl);
      }
    }
  } catch (err) {
    console.error("Could not load settings:", err);
  }

  // Logo URL live preview
  const logoInput = document.getElementById('set-rest-logo');
  if (logoInput) {
    logoInput.addEventListener('input', () => {
      renderLogoPreview(logoInput.value);
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
      const logoUrl = document.getElementById('set-rest-logo').value.trim();
      const description = document.getElementById('set-rest-desc').value.trim();
      const currency = document.getElementById('set-rest-currency').value.trim();

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const submitBtn = settingsForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerText = 'Saving...';

      try {
        await saveRestaurantSettings({ name, logoUrl, description, currency, slug });
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
