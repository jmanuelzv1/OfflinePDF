/**
 * OfflinePDF Paywall
 * Handles free tier limits, Pro status checks, and upgrade modal.
 * Include on every tool page before the tool's own script.
 *
 * Usage:
 *   Paywall.checkFileSize(file)      → throws if over limit
 *   Paywall.checkOpsLimit()          → throws if daily limit reached
 *   Paywall.recordOperation()        → increments today's op count
 *   Paywall.isPro()                  → returns true if user is Pro
 */

const Paywall = (() => {

  const FREE_MAX_MB   = 25;
  const FREE_MAX_OPS  = 5;
  const CHECKOUT_URL  = 'https://offlinepdf-checkout.offlinepdf.workers.dev';
  const SUPABASE_URL  = 'https://cboglntoucldhujbmeuc.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_k66dzxNIWHY7fL6G65fWLQ_nI6JBo6D';

  // ── localStorage keys ──────────────────────────────────────────────────
  const KEY_OPS_DATE  = 'opdf_ops_date';
  const KEY_OPS_COUNT = 'opdf_ops_count';
  const KEY_PRO_EMAIL = 'opdf_pro_email';
  const KEY_PRO_CACHE = 'opdf_pro_cache';
  const KEY_PRO_TS    = 'opdf_pro_ts';

  const PRO_CACHE_TTL = 1000 * 60 * 30; // 30 minutes

  // ── Ops counter ────────────────────────────────────────────────────────
  function getTodayKey() {
    return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function getOpsToday() {
    const date  = localStorage.getItem(KEY_OPS_DATE);
    const today = getTodayKey();
    if (date !== today) {
      localStorage.setItem(KEY_OPS_DATE,  today);
      localStorage.setItem(KEY_OPS_COUNT, '0');
      return 0;
    }
    return parseInt(localStorage.getItem(KEY_OPS_COUNT) || '0', 10);
  }

  function recordOperation() {
    const count = getOpsToday();
    localStorage.setItem(KEY_OPS_COUNT, String(count + 1));
  }

  // ── Pro status ─────────────────────────────────────────────────────────
  async function checkProStatus(email) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=plan,subscription_status`,
        {
          headers: {
            'apikey':        SUPABASE_ANON,
            'Authorization': `Bearer ${SUPABASE_ANON}`,
          },
        }
      );
      const data = await res.json();
      const user = data[0];
      return user?.plan === 'pro' && user?.subscription_status === 'active';
    } catch {
      return false;
    }
  }

  async function isPro() {
    const email = localStorage.getItem(KEY_PRO_EMAIL);
    if (!email) return false;

    // Check cache
    const cached = localStorage.getItem(KEY_PRO_CACHE);
    const ts     = parseInt(localStorage.getItem(KEY_PRO_TS) || '0', 10);
    if (cached !== null && Date.now() - ts < PRO_CACHE_TTL) {
      return cached === 'true';
    }

    // Fresh check
    const pro = await checkProStatus(email);
    localStorage.setItem(KEY_PRO_CACHE, String(pro));
    localStorage.setItem(KEY_PRO_TS,    String(Date.now()));
    return pro;
  }

  // ── Limit checks ───────────────────────────────────────────────────────
  async function checkFileSize(file) {
    const pro = await isPro();
    if (pro) return; // Pro users have no limit

    const mb = file.size / 1024 / 1024;
    if (mb > FREE_MAX_MB) {
      showModal('filesize', mb.toFixed(1));
      throw new Error('FILE_TOO_LARGE');
    }
  }

  async function checkOpsLimit() {
    const pro = await isPro();
    if (pro) return; // Pro users have no limit

    const ops = getOpsToday();
    if (ops >= FREE_MAX_OPS) {
      showModal('opslimit', ops);
      throw new Error('OPS_LIMIT_REACHED');
    }
  }

  // ── Upgrade modal ──────────────────────────────────────────────────────
  function showModal(reason, value) {
    // Remove existing modal
    document.getElementById('paywall-modal')?.remove();

    const title = reason === 'filesize'
      ? 'This file is too large for the free plan'
      : "You've reached today's limit";

    const desc = reason === 'filesize'
      ? `Your file is ${value} MB. The free plan supports files up to ${FREE_MAX_MB} MB. Upgrade to Pro for unlimited file sizes.`
      : `Free plan includes ${FREE_MAX_OPS} operations per day. You've used all ${value} today. Upgrade to Pro for unlimited daily operations.`;

    const modal = document.createElement('div');
    modal.id = 'paywall-modal';
    modal.innerHTML = `
      <div id="paywall-overlay">
        <div id="paywall-box">
          <div id="paywall-icon">
            <svg viewBox="0 0 32 32" fill="none" width="28" height="28">
              <path d="M16 3L4 9.5V17c0 6.6 5.1 12.8 12 14.5C23 29.8 28 23.6 28 17V9.5L16 3z"
                stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              <path d="M12 16l3 3 6-6" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div id="paywall-title">${title}</div>
          <div id="paywall-desc">${desc}</div>

          <div id="paywall-plans">
            <button class="paywall-plan-btn active" data-plan="annual">
              <div class="paywall-plan-label">Annual</div>
              <div class="paywall-plan-price">$7<span>/mo</span></div>
              <div class="paywall-plan-note">Billed $84/year</div>
              <div class="paywall-plan-badge">Save 22%</div>
            </button>
            <button class="paywall-plan-btn" data-plan="monthly">
              <div class="paywall-plan-label">Monthly</div>
              <div class="paywall-plan-price">$9<span>/mo</span></div>
              <div class="paywall-plan-note">Billed monthly</div>
            </button>
          </div>

          <div id="paywall-email-wrap">
            <input type="email" id="paywall-email" placeholder="Your email address" autocomplete="email" />
          </div>

          <button id="paywall-cta">Upgrade to Pro</button>
          <div id="paywall-error"></div>

          <div id="paywall-signin">
            Already have Pro?
            <a href="#" id="paywall-signin-link">Sign in to restore access</a>
          </div>

          <button id="paywall-close" aria-label="Close">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <style>
        #paywall-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; animation: paywall-fade .2s ease;
        }
        @keyframes paywall-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        #paywall-box {
          background: white; border-radius: 20px;
          padding: 36px; max-width: 420px; width: 100%;
          position: relative; text-align: center;
          box-shadow: 0 24px 64px rgba(0,0,0,.2);
          animation: paywall-up .25s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes paywall-up {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        #paywall-icon {
          width: 56px; height: 56px; border-radius: 50%;
          background: rgba(0,113,227,.1); color: #0071e3;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 20px;
        }
        #paywall-title {
          font-size: 18px; font-weight: 700; color: #1d1d1f;
          margin-bottom: 10px; line-height: 1.3;
        }
        #paywall-desc {
          font-size: 14px; color: #6e6e73; line-height: 1.6;
          margin-bottom: 24px;
        }
        #paywall-plans {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 10px; margin-bottom: 16px;
        }
        .paywall-plan-btn {
          border: 2px solid #e5e5ea; border-radius: 12px;
          padding: 14px 10px; cursor: pointer; background: white;
          position: relative; transition: border-color .15s;
          text-align: center;
        }
        .paywall-plan-btn.active {
          border-color: #0071e3; background: rgba(0,113,227,.04);
        }
        .paywall-plan-btn:hover { border-color: #0071e3; }
        .paywall-plan-label {
          font-size: 11px; font-weight: 700; color: #6e6e73;
          text-transform: uppercase; letter-spacing: .5px; margin-bottom: 6px;
        }
        .paywall-plan-btn.active .paywall-plan-label { color: #0071e3; }
        .paywall-plan-price {
          font-size: 26px; font-weight: 700; color: #1d1d1f; line-height: 1;
        }
        .paywall-plan-price span { font-size: 14px; font-weight: 400; color: #6e6e73; }
        .paywall-plan-note {
          font-size: 11px; color: #aeaeb2; margin-top: 4px;
        }
        .paywall-plan-badge {
          position: absolute; top: -8px; right: 8px;
          background: #34c759; color: white;
          font-size: 10px; font-weight: 700; padding: 2px 7px;
          border-radius: 20px; letter-spacing: .2px;
        }
        #paywall-email-wrap {
          margin-bottom: 12px;
        }
        #paywall-email {
          width: 100%; padding: 12px 16px; border-radius: 10px;
          border: 1.5px solid #e5e5ea; font-size: 15px;
          font-family: inherit; outline: none; transition: border-color .15s;
          box-sizing: border-box;
        }
        #paywall-email:focus { border-color: #0071e3; }
        #paywall-email.error { border-color: #ff3b30; }
        #paywall-cta {
          width: 100%; padding: 14px; border-radius: 980px;
          background: #0071e3; color: white; border: none;
          font-size: 16px; font-weight: 600; cursor: pointer;
          font-family: inherit; transition: background .15s, transform .15s;
          margin-bottom: 8px;
        }
        #paywall-cta:hover { background: #0077ed; transform: translateY(-1px); }
        #paywall-cta:disabled { opacity: .6; cursor: not-allowed; transform: none; }
        #paywall-error {
          font-size: 13px; color: #ff3b30; min-height: 18px;
          margin-bottom: 4px;
        }
        #paywall-signin {
          font-size: 13px; color: #aeaeb2; margin-top: 8px;
        }
        #paywall-signin a {
          color: #0071e3; text-decoration: none; font-weight: 500;
        }
        #paywall-signin a:hover { text-decoration: underline; }
        #paywall-close {
          position: absolute; top: 16px; right: 16px;
          width: 28px; height: 28px; border-radius: 50%;
          background: #f5f5f7; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #6e6e73; transition: background .15s;
        }
        #paywall-close:hover { background: #e8e8ed; }
      </style>
    `;

    document.body.appendChild(modal);

    // Plan toggle
    let selectedPlan = 'annual';
    modal.querySelectorAll('.paywall-plan-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.paywall-plan-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPlan = btn.dataset.plan;
      });
    });

    // Close
    modal.querySelector('#paywall-close').addEventListener('click', () => modal.remove());
    modal.querySelector('#paywall-overlay').addEventListener('click', e => {
      if (e.target === modal.querySelector('#paywall-overlay')) modal.remove();
    });

    // Upgrade CTA
    modal.querySelector('#paywall-cta').addEventListener('click', async () => {
      const email = modal.querySelector('#paywall-email').value.trim();
      const emailInput = modal.querySelector('#paywall-email');
      const errorEl    = modal.querySelector('#paywall-error');
      const ctaBtn     = modal.querySelector('#paywall-cta');

      errorEl.textContent = '';
      emailInput.classList.remove('error');

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailInput.classList.add('error');
        errorEl.textContent = 'Please enter a valid email address.';
        return;
      }

      ctaBtn.disabled     = true;
      ctaBtn.textContent  = 'Redirecting…';

      try {
        const res = await fetch(CHECKOUT_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, plan: selectedPlan }),
        });

        const data = await res.json();

        if (data.url) {
          // Save email for post-payment Pro check
          localStorage.setItem(KEY_PRO_EMAIL, email);
          window.location.href = data.url;
        } else {
          throw new Error(data.error || 'Could not create checkout session');
        }
      } catch (err) {
        ctaBtn.disabled    = false;
        ctaBtn.textContent = 'Upgrade to Pro';
        errorEl.textContent = 'Something went wrong. Please try again.';
      }
    });

    // Sign in link
    modal.querySelector('#paywall-signin-link').addEventListener('click', e => {
      e.preventDefault();
      const emailInput = modal.querySelector('#paywall-email');
      const email = emailInput.value.trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailInput.classList.add('error');
        modal.querySelector('#paywall-error').textContent = 'Enter your Pro account email to sign in.';
        return;
      }

      // Check Pro status for this email
      localStorage.setItem(KEY_PRO_EMAIL, email);
      localStorage.removeItem(KEY_PRO_CACHE);
      localStorage.removeItem(KEY_PRO_TS);

      const ctaBtn = modal.querySelector('#paywall-cta');
      ctaBtn.disabled    = true;
      ctaBtn.textContent = 'Checking…';

      checkProStatus(email).then(pro => {
        if (pro) {
          modal.remove();
          // Reload to re-enable the tool
          window.location.reload();
        } else {
          ctaBtn.disabled    = false;
          ctaBtn.textContent = 'Upgrade to Pro';
          modal.querySelector('#paywall-error').textContent =
            'No active Pro subscription found for this email.';
        }
      });
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    checkFileSize,
    checkOpsLimit,
    recordOperation,
    isPro,
    FREE_MAX_MB,
    FREE_MAX_OPS,
  };

})();
