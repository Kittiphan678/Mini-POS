"use strict";

/* ==========================================================================
   MINIPOS AI ENGINE - COMPLETE SMART POS SYSTEM
   ========================================================================== */

// ข้อมูลเริ่มต้นสำหรับระบบ
const INITIAL_PRODUCTS = {
  "ชานม": { price: 45, cost: 18, stock: 16, category: "ชา", emoji: "🧋" },
  "ชาไทย": { price: 40, cost: 15, stock: 14, category: "ชา", emoji: "🥤" },
  "ชาเขียว": { price: 40, cost: 16, stock: 8, category: "ชา", emoji: "🍵" },
  "กาแฟสด": { price: 50, cost: 20, stock: 5, category: "กาแฟ", emoji: "☕" },
  "นมสดคาราเมล": { price: 45, cost: 18, stock: 12, category: "นมสด", emoji: "🥛" },
  "เค้กช็อกโกแลต": { price: 65, cost: 28, stock: 6, category: "ขนม", emoji: "🍰" },
  "ครัวซองต์เนยสด": { price: 55, cost: 24, stock: 7, category: "ขนม", emoji: "🥐" }
};

// State Variables
let products = {};
let cart = {};              // { "ชานม_หวาน50%": { name: "ชานม", sweet: "50%", price: 45, qty: 1 } }
let sold = {};              // { "ชานม": 10 }
let historyBills = [];      // Array of completed orders
let appliedDiscount = null; // { code: "SALE10", percent: 10, amount: 0 }
let selectedItem = null;
let currentSweet = "50%";
let currentPaymentMethod = "cash";
let soundEnabled = true;
let currentCategory = "all";
let currentSearchQuery = "";

// Chart.js Instances
let trendChartInstance = null;
let categoryChartInstance = null;

// Helpers
const $ = (id) => document.getElementById(id);

/* ==========================================================================
   SOUND SYSTEM (Web Audio API - No external assets required)
   ========================================================================== */
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx && AudioContextClass) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playTone(freq, type, duration) {
  if (!soundEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    // Audio context may require user interaction
  }
}

const Sound = {
  click: () => playTone(600, "sine", 0.08),
  add: () => { playTone(520, "sine", 0.08); setTimeout(() => playTone(780, "sine", 0.1), 70); },
  success: () => {
    playTone(440, "triangle", 0.1);
    setTimeout(() => playTone(660, "triangle", 0.1), 100);
    setTimeout(() => playTone(880, "triangle", 0.2), 200);
  },
  warn: () => playTone(240, "sawtooth", 0.18),
  delete: () => playTone(300, "sine", 0.1)
};

/* ==========================================================================
   LOCALSTORAGE & PERSISTENCE
   ========================================================================== */
function loadState() {
  try {
    const savedProd = localStorage.getItem("minipos_products");
    const savedHist = localStorage.getItem("minipos_history");
    const savedSold = localStorage.getItem("minipos_sold");
    const savedSound = localStorage.getItem("minipos_sound");

    products = savedProd ? JSON.parse(savedProd) : JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
    historyBills = savedHist ? JSON.parse(savedHist) : [];
    sold = savedSold ? JSON.parse(savedSold) : {};
    if (savedSound !== null) soundEnabled = savedSound === "true";

    // Recalculate sold from history if sold is empty
    if (historyBills.length > 0 && Object.keys(sold).length === 0) {
      historyBills.forEach(b => {
        b.items.forEach(it => {
          sold[it.name] = (sold[it.name] || 0) + it.amount;
        });
      });
    }
  } catch (err) {
    console.warn("Storage load error:", err);
    products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
    historyBills = [];
    sold = {};
  }
}

function saveState() {
  try {
    localStorage.setItem("minipos_products", JSON.stringify(products));
    localStorage.setItem("minipos_history", JSON.stringify(historyBills));
    localStorage.setItem("minipos_sold", JSON.stringify(sold));
    localStorage.setItem("minipos_sound", soundEnabled.toString());
  } catch (err) {
    console.warn("Storage save error:", err);
  }
}

/* ==========================================================================
   CLOCK & TOPBAR
   ========================================================================== */
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("th-TH", { hour12: false });
  const clockEl = $("clock");
  if (clockEl) clockEl.textContent = timeStr;
}
setInterval(updateClock, 1000);
updateClock();

function toggleSound() {
  soundEnabled = !soundEnabled;
  $("soundToggle").textContent = soundEnabled ? "🔊 เสียง: เปิด" : "🔇 เสียง: ปิด";
  saveState();
  if (soundEnabled) Sound.click();
}
$("soundToggle").addEventListener("click", toggleSound);

/* ==========================================================================
   TAB NAVIGATION
   ========================================================================== */
function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-content").forEach(c => {
    c.classList.toggle("active", c.id === `tab-${tabId}`);
  });

  Sound.click();

  if (tabId === "ai") {
    runAutonomousAnalytics();
  } else if (tabId === "summary") {
    renderSummary();
  } else if (tabId === "stock") {
    renderInventory();
  }
}

document.querySelectorAll(".tab-nav .tab").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

/* ==========================================================================
   POS LOGIC & CART
   ========================================================================== */
function getCartSubtotal() {
  return Object.values(cart).reduce((sum, item) => sum + (item.price * item.qty), 0);
}

function getDiscountAmount(subtotal) {
  if (!appliedDiscount) return 0;
  if (appliedDiscount.percent) {
    return Math.round((subtotal * appliedDiscount.percent) / 100);
  }
  if (appliedDiscount.fixed) {
    return Math.min(appliedDiscount.fixed, subtotal);
  }
  return 0;
}

function getCartTotal() {
  const sub = getCartSubtotal();
  const disc = getDiscountAmount(sub);
  return Math.max(0, sub - disc);
}

function addToCart(name, qty, sweet) {
  if (!(name in products)) return { ok: false, msg: "ไม่พบสินค้านี้ในระบบ" };
  const prod = products[name];
  if (prod.stock < qty) return { ok: false, msg: `สินค้าคงเหลือไม่เพียงพอ (เหลือ ${prod.stock} ชิ้น)` };

  const cartKey = `${name}_${sweet || "normal"}`;
  prod.stock -= qty;

  if (cart[cartKey]) {
    cart[cartKey].qty += qty;
  } else {
    cart[cartKey] = {
      name: name,
      sweet: sweet || "50%",
      price: prod.price,
      cost: prod.cost || Math.round(prod.price * 0.45),
      qty: qty
    };
  }

  saveState();
  Sound.add();
  return { ok: true, msg: `เพิ่ม "${name}" (${qty} ชิ้น) เรียบร้อย` };
}

function updateCartItemQty(cartKey, delta) {
  const item = cart[cartKey];
  if (!item) return;

  if (delta > 0) {
    // Check if we have stock in products
    if (products[item.name].stock >= 1) {
      products[item.name].stock -= 1;
      item.qty += 1;
      Sound.add();
    } else {
      toast("สต็อกสินค้าไม่เพียงพอ", "error");
      Sound.warn();
      return;
    }
  } else if (delta < 0) {
    products[item.name].stock += 1;
    item.qty -= 1;
    Sound.delete();
    if (item.qty <= 0) {
      delete cart[cartKey];
    }
  }

  saveState();
  refresh();
}

function removeCartItem(cartKey) {
  const item = cart[cartKey];
  if (!item) return;
  products[item.name].stock += item.qty;
  delete cart[cartKey];
  saveState();
  Sound.delete();
  refresh();
  toast(`ลบ "${item.name}" ออกจากตะกร้าแล้ว`);
}

function cancelCart() {
  if (Object.keys(cart).length === 0) {
    toast("ยังไม่มีสินค้าในตะกร้า", "error");
    Sound.warn();
    return;
  }
  Object.values(cart).forEach(item => {
    products[item.name].stock += item.qty;
  });
  cart = {};
  appliedDiscount = null;
  $("discountCode").value = "";
  $("appliedDiscountTag").hidden = true;
  $("discountRow").hidden = true;
  saveState();
  Sound.delete();
  refresh();
  toast("ยกเลิกรายการและคืนสต็อกเรียบร้อย");
}

/* ==========================================================================
   DISCOUNT SYSTEM
   ========================================================================== */
function applyDiscountCode(code) {
  code = (code || "").trim().toUpperCase();
  if (!code) {
    toast("กรุณากรอกโค้ดส่วนลด", "error");
    return;
  }
  if (code === "SALE10") {
    appliedDiscount = { code: "SALE10", percent: 10, label: "ส่วนลด 10%" };
  } else if (code === "MINIPOS" || code === "AI15") {
    appliedDiscount = { code: code, percent: 15, label: "ส่วนลดพิเศษ 15%" };
  } else if (code === "VIP20") {
    appliedDiscount = { code: "VIP20", fixed: 20, label: "ส่วนลดสมาชิก 20฿" };
  } else {
    toast("โค้ดส่วนลดไม่ถูกต้องหรือหมดอายุ", "error");
    Sound.warn();
    return;
  }

  Sound.success();
  toast(`ใช้งานโค้ด ${appliedDiscount.label} สำเร็จ!`, "ok");
  renderCart();
}

$("applyDiscountBtn").addEventListener("click", () => {
  applyDiscountCode($("discountCode").value);
});

$("removeDiscountBtn").addEventListener("click", () => {
  appliedDiscount = null;
  $("discountCode").value = "";
  $("appliedDiscountTag").hidden = true;
  $("discountRow").hidden = true;
  Sound.click();
  renderCart();
});

/* ==========================================================================
   PAYMENT METHODS & CHECKOUT
   ========================================================================== */
document.querySelectorAll(".pay-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".pay-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentPaymentMethod = tab.dataset.method;
    Sound.click();

    $("cashPaySection").hidden = (currentPaymentMethod !== "cash");
    $("qrPaySection").hidden = (currentPaymentMethod !== "qr");
    $("transferPaySection").hidden = (currentPaymentMethod !== "transfer");
  });
});

function completeOrder(payAmount, paymentMethod) {
  const total = getCartTotal();
  const subtotal = getCartSubtotal();
  const discountAmt = getDiscountAmount(subtotal);

  const order = {
    no: historyBills.length + 1,
    time: new Date().toLocaleString("th-TH"),
    timestamp: Date.now(),
    hour: new Date().getHours(),
    items: Object.values(cart).map(i => ({
      name: i.name,
      sweet: i.sweet,
      amount: i.qty,
      price: i.price,
      cost: i.cost,
      total: i.qty * i.price
    })),
    subtotal: subtotal,
    discount: discountAmt,
    total: total,
    profit: Object.values(cart).reduce((sum, i) => sum + ((i.price - i.cost) * i.qty), 0) - discountAmt,
    pay: payAmount,
    change: Math.max(0, payAmount - total),
    method: paymentMethod || "เงินสด"
  };

  // Update sold counts
  order.items.forEach(i => {
    sold[i.name] = (sold[i.name] || 0) + i.amount;
  });

  historyBills.push(order);
  cart = {};
  appliedDiscount = null;
  $("discountCode").value = "";
  $("appliedDiscountTag").hidden = true;
  $("discountRow").hidden = true;
  $("payInput").value = "";

  saveState();
  Sound.success();

  // Show receipt modal
  showReceipt(order);
  refresh();
}

function checkout() {
  const total = getCartTotal();
  if (Object.keys(cart).length === 0) {
    toast("ยังไม่มีสินค้าในตะกร้า", "error");
    Sound.warn();
    return;
  }

  if (currentPaymentMethod === "cash") {
    const payVal = parseFloat($("payInput").value);
    if (!Number.isFinite(payVal)) {
      toast("กรุณาระบุจำนวนเงินที่รับจากลูกค้า", "error");
      Sound.warn();
      return;
    }
    if (payVal < total) {
      toast(`ยอดเงินไม่พอ (ขาดอีก ฿${total - payVal})`, "error");
      Sound.warn();
      return;
    }
    completeOrder(payVal, "เงินสด");
  } else if (currentPaymentMethod === "qr") {
    // Open PromptPay QR Modal
    openQrModal(total);
  } else if (currentPaymentMethod === "transfer") {
    completeOrder(total, "บัตร/เงินโอน");
  }
}

$("checkoutBtn").addEventListener("click", checkout);

/* ==========================================================================
   DYNAMIC PROMPTPAY QR CODE GENERATOR (NATIVE SVG)
   ========================================================================== */
function openQrModal(total) {
  $("qrAmountDisplay").textContent = `฿${total.toLocaleString()}`;
  generateDynamicSvgQr(total);
  $("qrModal").hidden = false;
  Sound.click();
}

function generateDynamicSvgQr(amount) {
  const container = $("qrCodeContainer");
  const size = 180;
  // Create stylized procedural QR representation with authentic registration squares
  const rects = [];
  const matrixSize = 25;
  const cellSize = size / matrixSize;

  // Pseudo-random deterministic grid based on amount
  const seed = amount * 1337 + 42;
  const rand = (i, j) => Math.sin(seed + i * 37 + j * 19) > 0.1;

  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      const isTopLeftEye = (r < 7 && c < 7);
      const isTopRightEye = (r < 7 && c >= matrixSize - 7);
      const isBottomLeftEye = (r >= matrixSize - 7 && c < 7);

      if (isTopLeftEye || isTopRightEye || isBottomLeftEye) {
        // Position eyes
        const eyeR = (r < 7) ? r : r - (matrixSize - 7);
        const eyeC = (c < 7) ? c : c - (matrixSize - 7);
        if (eyeR === 0 || eyeR === 6 || eyeC === 0 || eyeC === 6 || (eyeR >= 2 && eyeR <= 4 && eyeC >= 2 && eyeC <= 4)) {
          rects.push(`<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#003764"/>`);
        }
      } else if (rand(r, c)) {
        rects.push(`<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize - 0.4}" height="${cellSize - 0.4}" rx="1" fill="#111827"/>`);
      }
    }
  }

  container.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      ${rects.join("")}
      <!-- PromptPay Logo Center -->
      <rect x="${size * 0.38}" y="${size * 0.38}" width="${size * 0.24}" height="${size * 0.24}" rx="4" fill="#003764"/>
      <text x="${size * 0.5}" y="${size * 0.53}" font-family="sans-serif" font-weight="900" font-size="11" fill="#ffffff" text-anchor="middle">PP</text>
    </svg>
  `;
}

$("simulateQrPaidBtn").addEventListener("click", () => {
  $("qrModal").hidden = true;
  const total = getCartTotal();
  completeOrder(total, "QR พร้อมเพย์");
});

$("qrCloseBtn").addEventListener("click", () => {
  $("qrModal").hidden = true;
});

/* ==========================================================================
   RECEIPT MODAL
   ========================================================================== */
function showReceipt(o) {
  const body = $("receiptBody");
  body.innerHTML = `
    <div style="text-align: center; margin-bottom: 8px;">
      <h2 style="font-size: 1.2rem; margin:0;">⚡ MINIPOS STORE</h2>
      <small>ระบบขายหน้าร้านอัจฉริยะ</small><br>
      <small>บิลเลขที่: #${String(o.no).padStart(5, '0')}</small><br>
      <small>วันที่: ${o.time}</small>
    </div>
    <hr>
    ${o.items.map(i => `
      <div class="line">
        <span>${i.name} (${i.sweet}) x ${i.amount}</span>
        <span>฿${(i.amount * i.price).toLocaleString()}</span>
      </div>
    `).join("")}
    <hr>
    <div class="line">
      <span>รวมยอดสินค้า</span>
      <span>฿${o.subtotal.toLocaleString()}</span>
    </div>
    ${o.discount > 0 ? `
      <div class="line" style="color: #10b981;">
        <span>ส่วนลดพิเศษ</span>
        <span>-฿${o.discount.toLocaleString()}</span>
      </div>
    ` : ""}
    <div class="line" style="font-weight: bold; font-size: 1.1rem; margin-top: 4px;">
      <span>ยอดสุทธิ</span>
      <span>฿${o.total.toLocaleString()}</span>
    </div>
    <hr>
    <div class="line">
      <span>วิธีชำระ: ${o.method}</span>
      <span>รับมา: ฿${o.pay.toLocaleString()}</span>
    </div>
    <div class="line" style="font-weight: bold;">
      <span>เงินทอน</span>
      <span>฿${o.change.toLocaleString()}</span>
    </div>
    <div style="text-align: center; margin-top: 14px; font-size: 0.78rem;">
      *** ขอบคุณที่ใช้บริการ ***
    </div>
  `;
  $("receiptModal").hidden = false;
}

$("receiptClose").addEventListener("click", () => {
  $("receiptModal").hidden = true;
});

$("printReceiptBtn").addEventListener("click", () => {
  window.print();
});

/* ==========================================================================
   RENDERING POS UI
   ========================================================================== */
function renderProducts() {
  const grid = $("productGrid");
  grid.innerHTML = "";

  const query = currentSearchQuery.toLowerCase().trim();
  const filtered = Object.entries(products).filter(([name, p]) => {
    const matchCat = (currentCategory === "all" || p.category === currentCategory);
    const matchSearch = (!query || name.toLowerCase().includes(query));
    return matchCat && matchSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="muted" style="grid-column: 1/-1; text-align: center; padding: 40px;">ไม่พบสินค้าที่ตรงกับการค้นหา</div>`;
    return;
  }

  filtered.forEach(([name, p]) => {
    const card = document.createElement("div");
    card.className = "product" + (p.stock === 0 ? " soldout" : "");
    const stockClass = p.stock === 0 ? "out" : p.stock <= 3 ? "low" : "ok";
    const stockLabel = p.stock === 0 ? "สินค้าหมด" : `คงเหลือ ${p.stock} ชิ้น`;

    card.innerHTML = `
      <div class="emoji">${p.emoji || "🥤"}</div>
      <h3>${name}</h3>
      <span class="category-tag">${p.category || "ทั่วไป"}</span>
      <div class="price">฿${p.price}</div>
      <span class="badge ${stockClass}">${stockLabel}</span>
    `;

    if (p.stock > 0) {
      card.addEventListener("click", () => openOrderModal(name));
    } else {
      card.addEventListener("click", () => {
        toast("สินค้าหมดชั่วคราว กรุณาเติมสต็อก", "error");
        Sound.warn();
      });
    }

    grid.appendChild(card);
  });
}

function renderCart() {
  const items = Object.entries(cart);
  const totalCups = items.reduce((sum, [, i]) => sum + i.qty, 0);
  const subtotal = getCartSubtotal();
  const discountAmt = getDiscountAmount(subtotal);
  const total = Math.max(0, subtotal - discountAmt);

  // Topbar stats
  $("statMenus").textContent = items.length;
  $("statCups").textContent = totalCups;
  $("statPrice").textContent = total.toLocaleString();

  // Cart panel info
  $("cartInfo").textContent = items.length
    ? `รายการในตะกร้า ${items.length} เมนู (${totalCups} ชิ้น)`
    : "ยังไม่มีสินค้าในตะกร้า";

  const list = $("cartList");
  list.innerHTML = "";

  if (items.length === 0) {
    list.innerHTML = `<li class="muted" style="justify-content: center; padding: 25px;">🛒 ตะกร้าว่างเปล่า กดเลือกเมนูได้เลย</li>`;
  } else {
    items.forEach(([key, item]) => {
      const li = document.createElement("li");
      const itemSub = item.price * item.qty;
      const emoji = products[item.name]?.emoji || "🥤";

      li.innerHTML = `
        <div class="cart-item-info">
          <div class="cart-item-title">${emoji} ${item.name}</div>
          <div class="cart-item-detail">หวาน ${item.sweet} • ฿${item.price}/ชิ้น</div>
        </div>
        <div class="cart-item-qty-ctrl">
          <button class="cart-qty-btn minus" title="ลดจำนวน">−</button>
          <span class="cart-qty-num">${item.qty}</span>
          <button class="cart-qty-btn plus" title="เพิ่มจำนวน">+</button>
        </div>
        <div class="cart-item-sub">฿${itemSub}</div>
        <button class="btn-icon danger remove-btn" title="ลบรายการ">×</button>
      `;

      li.querySelector(".minus").addEventListener("click", () => updateCartItemQty(key, -1));
      li.querySelector(".plus").addEventListener("click", () => updateCartItemQty(key, 1));
      li.querySelector(".remove-btn").addEventListener("click", () => removeCartItem(key));

      list.appendChild(li);
    });
  }

  // Update breakdown
  $("subtotalPrice").textContent = `฿${subtotal.toLocaleString()}`;
  if (appliedDiscount) {
    $("appliedDiscountTag").hidden = false;
    $("discountLabel").textContent = `${appliedDiscount.label} (-฿${discountAmt.toLocaleString()})`;
    $("discountRow").hidden = false;
    $("discountAmount").textContent = `-฿${discountAmt.toLocaleString()}`;
  } else {
    $("appliedDiscountTag").hidden = true;
    $("discountRow").hidden = true;
  }
  $("totalPrice").textContent = `฿${total.toLocaleString()}`;
}

/* ==============================================
   ORDER MODAL (Sweetness & Quantity)
============================================== */
function openOrderModal(name) {
  selectedItem = name;
  const p = products[name];
  $("orderEmoji").textContent = p.emoji || "🥤";
  $("orderTitle").textContent = `สั่งซื้อ: ${name}`;
  $("orderDetail").textContent = `ราคา ฿${p.price} | สต็อกคงเหลือ ${p.stock} ชิ้น`;
  $("qtyInput").value = 1;
  currentSweet = "50%";

  document.querySelectorAll(".sweet-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.sweet === currentSweet);
  });

  updateOrderSubtotal();
  $("orderModal").hidden = false;
  Sound.click();
}

function updateOrderSubtotal() {
  if (!selectedItem || !products[selectedItem]) return;
  const q = Math.max(1, parseInt($("qtyInput").value, 10) || 1);
  const sub = products[selectedItem].price * q;
  $("orderSubtotal").textContent = sub.toLocaleString();
}

document.querySelectorAll(".sweet-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sweet-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentSweet = btn.dataset.sweet;
    Sound.click();
  });
});

$("qtyMinus").addEventListener("click", () => {
  const cur = parseInt($("qtyInput").value, 10) || 1;
  $("qtyInput").value = Math.max(1, cur - 1);
  updateOrderSubtotal();
  Sound.click();
});

$("qtyPlus").addEventListener("click", () => {
  const cur = parseInt($("qtyInput").value, 10) || 1;
  const maxStock = products[selectedItem]?.stock || 99;
  if (cur < maxStock) {
    $("qtyInput").value = cur + 1;
    updateOrderSubtotal();
    Sound.click();
  } else {
    toast(`สต็อกคงเหลือเพียง ${maxStock} ชิ้น`, "error");
    Sound.warn();
  }
});

$("qtyInput").addEventListener("input", updateOrderSubtotal);

$("orderConfirm").addEventListener("click", () => {
  const qty = parseInt($("qtyInput").value, 10) || 1;
  const res = addToCart(selectedItem, qty, currentSweet);
  if (res.ok) {
    toast(res.msg, "ok");
    $("orderModal").hidden = true;
    selectedItem = null;
    refresh();
  } else {
    toast(res.msg, "error");
    Sound.warn();
  }
});

$("orderClose").addEventListener("click", () => {
  $("orderModal").hidden = true;
  selectedItem = null;
});

/* Quick Pay Buttons */
document.querySelectorAll(".quick-pay button").forEach(b => {
  b.addEventListener("click", () => {
    const total = getCartTotal();
    $("payInput").value = (b.dataset.pay === "exact") ? total : b.dataset.pay;
    Sound.click();
  });
});

$("cancelBtn").addEventListener("click", cancelCart);

/* Filters & Search */
$("searchInput").addEventListener("input", (e) => {
  currentSearchQuery = e.target.value;
  renderProducts();
});

document.querySelectorAll(".category-filters .cat-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".category-filters .cat-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    currentCategory = pill.dataset.cat;
    Sound.click();
    renderProducts();
  });
});

/* ==========================================================================
   INVENTORY & STOCK MANAGEMENT
   ========================================================================== */
function renderInventory() {
  const tbody = $("inventoryTable");
  tbody.innerHTML = "";

  Object.entries(products).forEach(([name, p]) => {
    const tr = document.createElement("tr");
    const profit = p.price - (p.cost || 0);
    const margin = p.price > 0 ? Math.round((profit / p.price) * 100) : 0;
    const soldCount = sold[name] || 0;
    const statusClass = p.stock === 0 ? "out" : p.stock <= 3 ? "low" : "ok";
    const statusLabel = p.stock === 0 ? "สินค้าหมด" : p.stock <= 3 ? "ใกล้หมด" : "พร้อมขาย";

    tr.innerHTML = `
      <td><strong>${p.emoji || "🥤"} ${name}</strong></td>
      <td><span class="chip">${p.category || "ทั่วไป"}</span></td>
      <td>฿${p.price}</td>
      <td>฿${p.cost || 0}</td>
      <td><span style="color: var(--success);">+฿${profit} (${margin}%)</span></td>
      <td>${soldCount} ชิ้น</td>
      <td><strong style="color: var(--accent);">${p.stock}</strong></td>
      <td>
        <div class="quick-stock-btns">
          <button class="quick-stock-btn add5">+5</button>
          <button class="quick-stock-btn add10">+10</button>
          <button class="quick-stock-btn sub1">−1</button>
        </div>
      </td>
      <td><span class="badge ${statusClass}">${statusLabel}</span></td>
      <td>
        <button class="btn-sm edit-btn" style="padding: 3px 8px;">✏️ แก้ไข</button>
      </td>
    `;

    tr.querySelector(".add5").addEventListener("click", () => adjustStock(name, 5));
    tr.querySelector(".add10").addEventListener("click", () => adjustStock(name, 10));
    tr.querySelector(".sub1").addEventListener("click", () => adjustStock(name, -1));
    tr.querySelector(".edit-btn").addEventListener("click", () => openEditProductModal(name));

    tbody.appendChild(tr);
  });
}

function adjustStock(name, delta) {
  if (!products[name]) return;
  products[name].stock = Math.max(0, products[name].stock + delta);
  saveState();
  Sound.add();
  renderInventory();
  renderProducts();
  toast(`ปรับสต็อก "${name}" เป็น ${products[name].stock} ชิ้น เรียบร้อย`, "ok");
}

/* Modal Add/Edit Product */
function openAddProductModal() {
  $("productModalTitle").textContent = "➕ เพิ่มสินค้า / เมนูใหม่";
  $("editProductKey").value = "";
  $("prodName").value = "";
  $("prodName").disabled = false;
  $("prodCategory").value = "ชา";
  $("prodEmoji").value = "🧋";
  $("prodPrice").value = 45;
  $("prodCost").value = 18;
  $("prodStock").value = 15;
  $("productModal").hidden = false;
  Sound.click();
}

function openEditProductModal(name) {
  const p = products[name];
  $("productModalTitle").textContent = `✏️ แก้ไขสินค้า: ${name}`;
  $("editProductKey").value = name;
  $("prodName").value = name;
  $("prodName").disabled = true; // Key
  $("prodCategory").value = p.category || "ชา";
  $("prodEmoji").value = p.emoji || "🥤";
  $("prodPrice").value = p.price;
  $("prodCost").value = p.cost || 0;
  $("prodStock").value = p.stock;
  $("productModal").hidden = false;
  Sound.click();
}

$("openAddProductModal").addEventListener("click", openAddProductModal);
$("closeProductModalBtn").addEventListener("click", () => { $("productModal").hidden = true; });

$("productForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const editKey = $("editProductKey").value.trim();
  const name = $("prodName").value.trim();
  const category = $("prodCategory").value;
  const emoji = $("prodEmoji").value.trim() || "🥤";
  const price = parseInt($("prodPrice").value, 10);
  const cost = parseInt($("prodCost").value, 10);
  const stock = parseInt($("prodStock").value, 10);

  if (!name || isNaN(price) || isNaN(cost) || isNaN(stock)) {
    toast("กรุณากรอกข้อมูลให้ครบถ้วนถูกต้อง", "error");
    return;
  }

  if (editKey && products[editKey]) {
    products[editKey].category = category;
    products[editKey].emoji = emoji;
    products[editKey].price = price;
    products[editKey].cost = cost;
    products[editKey].stock = stock;
    toast(`แก้ไขข้อมูล "${editKey}" เรียบร้อย`, "ok");
  } else {
    if (products[name]) {
      toast("มีชื่อสินค้านี้ในระบบแล้ว", "error");
      return;
    }
    products[name] = { price, cost, stock, category, emoji };
    toast(`เพิ่มสินค้าใหม่ "${name}" เรียบร้อย`, "ok");
  }

  saveState();
  Sound.success();
  $("productModal").hidden = true;
  refresh();
});

$("resetBtn").addEventListener("click", () => {
  if (confirm("ต้องการรีเซ็ตสต็อก เมนู และประวัติทั้งหมดกลับเป็นค่าเริ่มต้นหรือไม่?")) {
    products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
    cart = {};
    historyBills = [];
    sold = {};
    saveState();
    Sound.delete();
    refresh();
    toast("รีเซ็ตระบบเป็นค่าเริ่มต้นเรียบร้อยแล้ว", "ok");
  }
});

/* ==========================================================================
   SALES SUMMARY & HISTORY
   ========================================================================== */
function renderSummary() {
  const totalOrders = historyBills.length;
  const totalCups = historyBills.reduce((acc, b) => acc + b.items.reduce((s, i) => s + i.amount, 0), 0);
  const totalRevenue = historyBills.reduce((acc, b) => acc + b.total, 0);
  const totalProfit = historyBills.reduce((acc, b) => acc + (b.profit || 0), 0);
  const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  $("sumOrders").textContent = totalOrders.toLocaleString();
  $("sumCups").textContent = totalCups.toLocaleString();
  $("sumRevenue").textContent = `฿${totalRevenue.toLocaleString()}`;
  $("sumProfit").textContent = `฿${totalProfit.toLocaleString()}`;
  $("sumAOV").textContent = `฿${aov.toLocaleString()}`;

  renderHistoryTable();
}

function renderHistoryTable() {
  const tbody = $("historyTableBody");
  tbody.innerHTML = "";

  const query = ($("searchHistoryInput")?.value || "").toLowerCase().trim();
  const filtered = historyBills.slice().reverse().filter(b => {
    if (!query) return true;
    const matchNo = `#${b.no}`.includes(query) || String(b.no).includes(query);
    const matchItems = b.items.some(i => i.name.toLowerCase().includes(query));
    return matchNo || matchItems;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align: center; padding: 30px;">ยังไม่มีประวัติการขาย</td></tr>`;
    return;
  }

  filtered.forEach(o => {
    const tr = document.createElement("tr");
    const itemsSummary = o.items.map(i => `${i.name} (${i.sweet}) x${i.amount}`).join(", ");

    tr.innerHTML = `
      <td><strong style="color: var(--accent);">#${String(o.no).padStart(4, '0')}</strong></td>
      <td><small class="muted">${o.time}</small></td>
      <td style="max-width: 280px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${itemsSummary}">${itemsSummary}</td>
      <td><span class="chip">${o.method || "เงินสด"}</span></td>
      <td><strong style="color: var(--success);">฿${o.total.toLocaleString()}</strong></td>
      <td><small>รับ: ฿${o.pay} / ทอน: ฿${o.change}</small></td>
      <td>
        <button class="btn-sm view-btn" style="padding: 2px 8px;">ใบเสร็จ</button>
      </td>
    `;

    tr.querySelector(".view-btn").addEventListener("click", () => showReceipt(o));
    tbody.appendChild(tr);
  });
}

$("searchHistoryInput")?.addEventListener("input", renderHistoryTable);

// Export CSV
$("exportCsvBtn").addEventListener("click", () => {
  if (historyBills.length === 0) {
    toast("ยังไม่มีข้อมูลสำหรับส่งออก", "error");
    return;
  }
  let csv = "\uFEFFบิลเลขที่,วัน-เวลา,วิธีชำระ,ยอดรวม(บาท),กำไร(บาท),รายการสินค้า\n";
  historyBills.forEach(b => {
    const itemsStr = b.items.map(i => `${i.name}x${i.amount}`).join("; ");
    csv += `"${b.no}","${b.time}","${b.method || 'เงินสด'}","${b.total}","${b.profit || 0}","${itemsStr}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales_report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("ส่งออกไฟล์ CSV สำเร็จ!", "ok");
  Sound.success();
});

// Demo Data Simulator (Generate 30 realistic sales bills)
$("demoDataBtn").addEventListener("click", () => {
  generateDemoSalesData();
});

function generateDemoSalesData() {
  const sampleItems = Object.keys(products);
  const methods = ["เงินสด", "QR พร้อมเพย์", "บัตร/เงินโอน"];
  const sweets = ["100%", "50%", "25%", "0%"];
  const now = Date.now();

  // Create 30 historical orders spread over the past 8 hours
  for (let i = 0; i < 30; i++) {
    const hoursAgo = Math.floor(Math.random() * 8);
    const orderTime = new Date(now - (hoursAgo * 3600 * 1000) - Math.floor(Math.random() * 3600 * 1000));
    
    // Pick 1 to 3 items
    const itemCount = Math.floor(Math.random() * 2) + 1;
    const orderItems = [];
    let sub = 0;
    let costTotal = 0;

    for (let j = 0; j < itemCount; j++) {
      const prodName = sampleItems[Math.floor(Math.random() * sampleItems.length)];
      const p = products[prodName];
      const qty = Math.floor(Math.random() * 2) + 1;
      const sweet = sweets[Math.floor(Math.random() * sweets.length)];
      orderItems.push({
        name: prodName,
        sweet: sweet,
        amount: qty,
        price: p.price,
        cost: p.cost,
        total: p.price * qty
      });
      sub += p.price * qty;
      costTotal += p.cost * qty;
      sold[prodName] = (sold[prodName] || 0) + qty;
    }

    const order = {
      no: historyBills.length + 1,
      time: orderTime.toLocaleString("th-TH"),
      timestamp: orderTime.getTime(),
      hour: orderTime.getHours(),
      items: orderItems,
      subtotal: sub,
      discount: 0,
      total: sub,
      profit: sub - costTotal,
      pay: Math.ceil(sub / 50) * 50,
      change: (Math.ceil(sub / 50) * 50) - sub,
      method: methods[Math.floor(Math.random() * methods.length)]
    };

    historyBills.push(order);
  }

  saveState();
  Sound.success();
  refresh();
  toast("⚡ จำลองข้อมูลยอดขาย 30 บิลสำเร็จ! สลับไปดูแท็บ AI เพื่อดูการวิเคราะห์ได้เลย", "ok");
}

/* ==========================================================================
   AUTONOMOUS AI BRAIN & DECISION ENGINE ("ระบบคิดวิเคราะห์เอง")
   ========================================================================== */

function runAutonomousAnalytics() {
  $("aiLastUpdated").textContent = `คำนวณล่าสุด: ${new Date().toLocaleTimeString("th-TH")}`;

  // 1. Calculate Core Store Metrics
  const totalBills = historyBills.length;
  const totalRev = historyBills.reduce((s, b) => s + b.total, 0);
  const totalProf = historyBills.reduce((s, b) => s + (b.profit || 0), 0);
  const avgMargin = totalRev > 0 ? (totalProf / totalRev) : 0.45;

  // 2. Compute AI Health Score (0 - 100)
  let healthScore = 70;
  // Factor A: Profit Margin (target > 40%)
  if (avgMargin >= 0.5) healthScore += 12;
  else if (avgMargin >= 0.4) healthScore += 8;
  else healthScore -= 5;

  // Factor B: Stockout check
  const lowStockCount = Object.values(products).filter(p => p.stock > 0 && p.stock <= 3).length;
  const outOfStockCount = Object.values(products).filter(p => p.stock === 0).length;
  healthScore -= (outOfStockCount * 8);
  healthScore -= (lowStockCount * 3);

  // Factor C: Order volume
  if (totalBills >= 25) healthScore += 10;
  else if (totalBills >= 10) healthScore += 5;

  healthScore = Math.max(20, Math.min(98, healthScore));

  // Render Health Score & Circle
  $("healthScoreNum").textContent = healthScore;
  const circumference = 264;
  const offset = circumference - (healthScore / 100) * circumference;
  $("scoreCircle").style.strokeDashoffset = offset;

  if (healthScore >= 80) {
    $("healthGrade").textContent = "ระดับ: ดีเยี่ยม (Grade A)";
    $("healthGrade").style.color = "var(--success)";
    $("scoreCircle").style.stroke = "var(--success)";
    $("healthSummary").textContent = "ร้านมีสถานะทางการเงินดีมาก กำไรสูง สต็อกมีความสมดุลและมีความเสี่ยงต่ำ";
  } else if (healthScore >= 65) {
    $("healthGrade").textContent = "ระดับ: ปานกลาง (Grade B)";
    $("healthGrade").style.color = "var(--warning)";
    $("scoreCircle").style.stroke = "var(--warning)";
    $("healthSummary").textContent = "ยอดขายทำได้ดี แต่ควรระวังเรื่องสต็อกสินค้าบางตัวที่เริ่มร่อยหรอ";
  } else {
    $("healthGrade").textContent = "ระดับ: ต้องเฝ้าระวัง (Grade C)";
    $("healthGrade").style.color = "var(--danger)";
    $("scoreCircle").style.stroke = "var(--danger)";
    $("healthSummary").textContent = "มีสินค้าหมดสต็อกหรืออัตรากำไรลดลง ควรรีบเติมสินค้าและปรับกลยุทธ์";
  }

  // 3. Autonomous Executive Bulletins
  renderAutonomousInsights(totalBills, totalRev, totalProf, avgMargin, outOfStockCount, lowStockCount);

  // 4. Run-Out & Sales Velocity Predictor
  renderStockoutPredictions();

  // 5. Smart Reorder Recommendations
  renderReorderRecommendations();

  // 6. BCG Menu Matrix
  renderBcgMatrix();

  // 7. Market Basket Analysis & Combo Deals
  renderComboBundles();

  // 8. Render Visual Charts
  renderAiCharts();
}

/* Bulletins Generator */
function renderAutonomousInsights(bills, rev, prof, margin, outCount, lowCount) {
  const list = $("aiInsightsList");
  list.innerHTML = "";

  const bullets = [];

  // Insight 1: Stockout Alert
  if (outCount > 0) {
    const outNames = Object.entries(products).filter(([, p]) => p.stock === 0).map(([n]) => n).join(", ");
    bullets.push({
      type: "danger",
      text: `🚨 <strong>สินค้าหมดสต็อก (${outCount} รายการ):</strong> [${outNames}] ส่งผลให้เสียโอกาสทำเงิน ควรรีบสั่งวัตถุดิบเข้ามาเติมด่วน`
    });
  } else if (lowCount > 0) {
    const lowNames = Object.entries(products).filter(([, p]) => p.stock > 0 && p.stock <= 3).map(([n]) => n).join(", ");
    bullets.push({
      type: "warn",
      text: `⚠️ <strong>สต็อกใกล้หมด (${lowCount} รายการ):</strong> [${lowNames}] อัตราคงเหลือต่ำกว่าเกณฑ์ความปลอดภัย แนะนำให้เติมล่วงหน้า`
    });
  } else {
    bullets.push({
      type: "success",
      text: `✅ <strong>ระดับสต็อกสมบูรณ์:</strong> สินค้าทุกรายการมีสต็อกพร้อมขาย ไม่มีความเสี่ยงของขาดในขณะนี้`
    });
  }

  // Insight 2: Top Revenue Driver
  let topItem = null;
  let maxSold = -1;
  Object.entries(sold).forEach(([name, count]) => {
    if (count > maxSold) { maxSold = count; topItem = name; }
  });

  if (topItem && maxSold > 0) {
    bullets.push({
      type: "info",
      text: `🔥 <strong>เมนูสร้างยอดขายหลัก:</strong> "${topItem}" ขายดีที่สุดจำนวน ${maxSold} ชิ้น สร้างสัดส่วนลูกค้านิยมสูงสุดในร้าน`
    });
  }

  // Insight 3: Margin & Profit Quality
  const marginPct = Math.round(margin * 100);
  if (marginPct >= 50) {
    bullets.push({
      type: "success",
      text: `💰 <strong>อัตรากำไรขั้นต้นยอดเยี่ยม (${marginPct}%):</strong> โครงสร้างต้นทุนของร้านควบคุมได้ดีมาก แนะนำรักษาระดับราคานี้ต่อไป`
    });
  } else {
    bullets.push({
      type: "warn",
      text: `💡 <strong>ข้อเสนอแนะด้านต้นทุน:</strong> อัตรากำไรเฉลี่ยอยู่ที่ ${marginPct}% ลองจัดเซ็ตคู่ขนมหรือท็อปปิ้งเสริมเพื่อดัน Basket Size ให้สูงขึ้น`
    });
  }

  // Insight 4: Peak Hour Analysis
  if (bills >= 5) {
    const hourCounts = {};
    historyBills.forEach(b => {
      const h = b.hour || 12;
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    let peakHour = 12;
    let peakCount = 0;
    Object.entries(hourCounts).forEach(([h, c]) => {
      if (c > peakCount) { peakCount = c; peakHour = h; }
    });
    bullets.push({
      type: "info",
      text: `⏰ <strong>ช่วงเวลาขายดีที่สุด:</strong> ช่วง ${peakHour}:00 - ${parseInt(peakHour, 10) + 1}:00 น. มีออเดอร์หนาแน่น แนะนำเตรียมวัตถุดิบล่วงหน้า 30 นาทีก่อนเวลานี้`
    });
  }

  bullets.forEach(b => {
    const li = document.createElement("li");
    li.className = `bullet-item ${b.type}`;
    li.innerHTML = b.text;
    list.appendChild(li);
  });
}

/* Run-Out Prediction */
function renderStockoutPredictions() {
  const container = $("stockPredictionList");
  container.innerHTML = "";

  // Calculate sales velocity (units per hour)
  const sorted = Object.entries(products).map(([name, p]) => {
    const soldCount = sold[name] || 0;
    // Estimate hourly rate based on total bills
    const ratePerHour = historyBills.length > 0 ? (soldCount / Math.max(4, historyBills.length / 3)) : 0.4;
    const hoursLeft = ratePerHour > 0 ? (p.stock / ratePerHour) : 99;

    return { name, p, soldCount, ratePerHour, hoursLeft };
  }).sort((a, b) => a.hoursLeft - b.hoursLeft);

  sorted.forEach(item => {
    const div = document.createElement("div");
    div.className = "pred-item";

    let timeText = "";
    let badgeClass = "ok";
    let badgeLabel = "ปลอดภัย";

    if (item.p.stock === 0) {
      timeText = "หมดสต็อกแล้ว!";
      badgeClass = "out";
      badgeLabel = "หมดทันที";
    } else if (item.hoursLeft <= 2) {
      timeText = `หมดใน ~${Math.round(item.hoursLeft * 60)} นาที`;
      badgeClass = "low";
      badgeLabel = "วิกฤต";
    } else if (item.hoursLeft <= 6) {
      timeText = `หมดใน ~${Math.round(item.hoursLeft)} ชั่วโมง`;
      badgeClass = "low";
      badgeLabel = "ควรเตรียมของ";
    } else {
      timeText = `ขายได้อีก ~${Math.round(item.hoursLeft)} ชม.`;
      badgeClass = "ok";
      badgeLabel = "เพียงพอ";
    }

    div.innerHTML = `
      <div class="pred-name">
        <span>${item.p.emoji || "🥤"}</span>
        <div>
          <div>${item.name}</div>
          <small class="muted">คงเหลือ ${item.p.stock} ชิ้น • ขายแล้ว ${item.soldCount}</small>
        </div>
      </div>
      <div class="pred-stats">
        <div class="pred-time">${timeText}</div>
        <span class="badge ${badgeClass}">${badgeLabel}</span>
      </div>
    `;

    container.appendChild(div);
  });
}

/* Smart Reorder Recommendation */
function renderReorderRecommendations() {
  const container = $("reorderContent");
  container.innerHTML = "";

  const needsRestock = [];

  Object.entries(products).forEach(([name, p]) => {
    // If stock is below target buffer (e.g. 10)
    const targetBuffer = 15;
    if (p.stock < 8) {
      const suggestedQty = targetBuffer - p.stock;
      const estimatedCost = suggestedQty * (p.cost || Math.round(p.price * 0.45));
      needsRestock.push({ name, p, suggestedQty, estimatedCost });
    }
  });

  if (needsRestock.length === 0) {
    container.innerHTML = `
      <div class="glass" style="text-align: center; padding: 25px; border-color: rgba(16, 185, 129, 0.3);">
        <span style="font-size: 2rem;">🎉</span>
        <h3 style="color: var(--success); margin: 6px 0;">สต็อกสินค้าทุกรายการอยู่ในระดับที่สมบูรณ์</h3>
        <p class="muted">AI ตรวจสอบแล้ว ยังไม่มีสินค้าใดที่จำเป็นต้องสั่งซื้อเพิ่มในขณะนี้</p>
      </div>
    `;
    $("autoRestockBtn").disabled = true;
    $("autoRestockBtn").style.opacity = "0.5";
    return;
  }

  $("autoRestockBtn").disabled = false;
  $("autoRestockBtn").style.opacity = "1";

  const totalBudget = needsRestock.reduce((s, i) => s + i.estimatedCost, 0);

  const summaryBanner = document.createElement("div");
  summaryBanner.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(0,212,255,0.08); padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border); font-size: 0.85rem;";
  summaryBanner.innerHTML = `
    <span>ตรวจพบรายการควรเติม <strong>${needsRestock.length} รายการ</strong></span>
    <span>งบประมาณสั่งซื้อประมาณ: <strong style="color: var(--accent);">฿${totalBudget.toLocaleString()}</strong></span>
  `;
  container.appendChild(summaryBanner);

  needsRestock.forEach(item => {
    const card = document.createElement("div");
    card.className = "reorder-card";
    card.innerHTML = `
      <div class="reorder-info">
        <h4>${item.p.emoji || "🥤"} เติม "${item.name}"</h4>
        <p>สต็อกปัจจุบัน: ${item.p.stock} ชิ้น (จุดสั่งซื้อ ROP: &lt; 8 ชิ้น)</p>
      </div>
      <div class="reorder-action" style="text-align: right;">
        <div>แนะสั่ง <strong>+${item.suggestedQty} ชิ้น</strong></div>
        <small class="muted">งบประมาณ: ฿${item.estimatedCost.toLocaleString()}</small>
      </div>
    `;
    container.appendChild(card);
  });
}

// 1-Click Auto Restock
$("autoRestockBtn").addEventListener("click", () => {
  let restockedCount = 0;
  Object.entries(products).forEach(([name, p]) => {
    if (p.stock < 8) {
      const addAmount = 15 - p.stock;
      p.stock += addAmount;
      restockedCount++;
    }
  });

  if (restockedCount > 0) {
    saveState();
    Sound.success();
    runAutonomousAnalytics();
    renderProducts();
    renderInventory();
    toast(`⚡ AI ดำเนินการเติมสต็อกสินค้าที่ขาดให้เรียบร้อยแล้ว (${restockedCount} รายการ)`, "ok");
  } else {
    toast("สต็อกทุกรายการอยู่ในระดับที่เหมาะสมแล้ว");
  }
});

/* BCG Matrix Engine */
function renderBcgMatrix() {
  const stars = [];
  const cows = [];
  const questions = [];
  const dogs = [];

  const itemStats = Object.entries(products).map(([name, p]) => {
    const soldQty = sold[name] || 0;
    const profitMargin = p.price > 0 ? (p.price - p.cost) / p.price : 0;
    return { name, p, soldQty, profitMargin };
  });

  // Calculate median thresholds
  const avgSold = itemStats.reduce((s, i) => s + i.soldQty, 0) / Math.max(1, itemStats.length);
  const avgMargin = 0.45; // 45% standard benchmark

  itemStats.forEach(item => {
    const isHighSales = item.soldQty >= Math.max(2, avgSold * 0.9);
    const isHighMargin = item.profitMargin >= avgMargin;
    const tag = `${item.p.emoji || ""} ${item.name} (ขาย ${item.soldQty}, กำไร ${Math.round(item.profitMargin * 100)}%)`;

    if (isHighSales && isHighMargin) stars.push(tag);
    else if (isHighSales && !isHighMargin) cows.push(tag);
    else if (!isHighSales && isHighMargin) questions.push(tag);
    else dogs.push(tag);
  });

  $("bcgStars").innerHTML = stars.length ? stars.map(s => `<div>• ${s}</div>`).join("") : '<span class="muted">- ไม่มี -</span>';
  $("bcgCows").innerHTML = cows.length ? cows.map(s => `<div>• ${s}</div>`).join("") : '<span class="muted">- ไม่มี -</span>';
  $("bcgQuestions").innerHTML = questions.length ? questions.map(s => `<div>• ${s}</div>`).join("") : '<span class="muted">- ไม่มี -</span>';
  $("bcgDogs").innerHTML = dogs.length ? dogs.map(s => `<div>• ${s}</div>`).join("") : '<span class="muted">- ไม่มี -</span>';
}

/* Basket Analysis & Combo Deals */
function renderComboBundles() {
  const container = $("comboSuggestions");
  container.innerHTML = "";

  // Count pair frequencies in history
  const pairCounts = {};
  historyBills.forEach(b => {
    const itemNames = Array.from(new Set(b.items.map(i => i.name)));
    for (let i = 0; i < itemNames.length; i++) {
      for (let j = i + 1; j < itemNames.length; j++) {
        const pairKey = [itemNames[i], itemNames[j]].sort().join(" + ");
        pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
      }
    }
  });

  // Default smart recommendations if few bills exist
  let pairs = Object.entries(pairCounts).sort((a, b) => b[1] - a[1]);
  if (pairs.length === 0) {
    pairs = [
      ["กาแฟสด + ครัวซองต์เนยสด", 12],
      ["ชานม + เค้กช็อกโกแลต", 8]
    ];
  }

  pairs.slice(0, 3).forEach(([pair, count]) => {
    const [itemA, itemB] = pair.split(" + ");
    const pA = products[itemA] || { price: 45, emoji: "🥤" };
    const pB = products[itemB] || { price: 55, emoji: "🥐" };
    const originalSum = pA.price + pB.price;
    const comboPrice = originalSum - 10;

    const card = document.createElement("div");
    card.className = "combo-card";
    card.innerHTML = `
      <div class="combo-desc">
        <strong>🔥 เซ็ตคู่หูสุดฮิต: ${pair}</strong>
        <p>ถูกสั่งซื้อร่วมกันบ่อย (${count} ครั้ง) • AI แนะนำ: ขายแพ็กคู่ ฿${comboPrice} (ประหยัด ฿10) คาดเพิ่มยอดขาย +20%</p>
      </div>
      <button class="btn-sm btn-accent apply-bundle-btn" style="white-space: nowrap;">⚡ สั่งเซ็ตนี้</button>
    `;

    card.querySelector(".apply-bundle-btn").addEventListener("click", () => {
      addToCart(itemA, 1, "50%");
      addToCart(itemB, 1, "50%");
      switchTab("pos");
      toast(`เพิ่มเซ็ตคู่ "${pair}" เข้าตะกร้าเรียบร้อย`, "ok");
    });

    container.appendChild(card);
  });
}

/* Visual Charts with Chart.js */
function renderAiCharts() {
  if (typeof Chart === "undefined") return;

  // Chart 1: Hourly Sales Trend
  const hourlyData = Array(24).fill(0);
  historyBills.forEach(b => {
    const h = b.hour || new Date(b.timestamp || Date.now()).getHours();
    hourlyData[h] += b.total;
  });

  // Pick active hours (e.g. 08:00 - 20:00)
  const hoursLabels = [];
  const hoursValues = [];
  for (let h = 8; h <= 20; h++) {
    hoursLabels.push(`${h}:00`);
    hoursValues.push(hourlyData[h] || 0);
  }

  const ctx1 = $("salesTrendChart")?.getContext("2d");
  if (ctx1) {
    if (trendChartInstance) trendChartInstance.destroy();
    trendChartInstance = new Chart(ctx1, {
      type: "line",
      data: {
        labels: hoursLabels,
        datasets: [{
          label: "ยอดขายตามช่วงเวลา (บาท)",
          data: hoursValues,
          borderColor: "#00d4ff",
          backgroundColor: "rgba(0, 212, 255, 0.12)",
          fill: true,
          tension: 0.35,
          pointBackgroundColor: "#8b5cf6",
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#e2e8f0", font: { family: "Prompt" } } }
        },
        scales: {
          x: { ticks: { color: "#8498b5" }, grid: { color: "rgba(255,255,255,0.05)" } },
          y: { ticks: { color: "#8498b5" }, grid: { color: "rgba(255,255,255,0.05)" } }
        }
      }
    });
  }

  // Chart 2: Revenue vs Profit breakdown by product
  const prodNames = Object.keys(products);
  const revPerProd = prodNames.map(n => (sold[n] || 0) * products[n].price);
  const profPerProd = prodNames.map(n => (sold[n] || 0) * (products[n].price - products[n].cost));

  const ctx2 = $("categoryProfitChart")?.getContext("2d");
  if (ctx2) {
    if (categoryChartInstance) categoryChartInstance.destroy();
    categoryChartInstance = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: prodNames,
        datasets: [
          {
            label: "ยอดขายรวม (บาท)",
            data: revPerProd,
            backgroundColor: "rgba(0, 212, 255, 0.75)",
            borderRadius: 6
          },
          {
            label: "กำไรสุทธิ (บาท)",
            data: profPerProd,
            backgroundColor: "rgba(16, 185, 129, 0.75)",
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#e2e8f0", font: { family: "Prompt" } } }
        },
        scales: {
          x: { ticks: { color: "#8498b5" }, grid: { color: "rgba(255,255,255,0.05)" } },
          y: { ticks: { color: "#8498b5" }, grid: { color: "rgba(255,255,255,0.05)" } }
        }
      }
    });
  }
}

/* ==========================================================================
   INTERACTIVE AI CONSULTANT (CHATBOT)
   ========================================================================== */
function askAiAdvisor(question) {
  question = question.trim();
  if (!question) return;

  const chatLog = $("aiChatLog");

  // User Message
  const userDiv = document.createElement("div");
  userDiv.className = "chat-msg user";
  userDiv.innerHTML = `
    <div class="msg-avatar">👤</div>
    <div class="msg-bubble">${question}</div>
  `;
  chatLog.appendChild(userDiv);
  Sound.click();

  // Scroll
  chatLog.scrollTop = chatLog.scrollHeight;

  // Generate Grounded AI Answer
  setTimeout(() => {
    const aiAnswer = generateAiAnswer(question);
    const aiDiv = document.createElement("div");
    aiDiv.className = "chat-msg ai";
    aiDiv.innerHTML = `
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">${aiAnswer}</div>
    `;
    chatLog.appendChild(aiDiv);
    chatLog.scrollTop = chatLog.scrollHeight;
    Sound.add();
  }, 400);
}

function generateAiAnswer(q) {
  const totalBills = historyBills.length;
  const totalRev = historyBills.reduce((s, b) => s + b.total, 0);
  const totalProf = historyBills.reduce((s, b) => s + (b.profit || 0), 0);
  const qLower = q.toLowerCase();

  // Find best margin product
  let bestMarginProd = "";
  let highestMargin = -1;
  Object.entries(products).forEach(([name, p]) => {
    const m = (p.price - p.cost) / p.price;
    if (m > highestMargin) { highestMargin = m; bestMarginProd = name; }
  });

  // Find low stock products
  const lowStock = Object.entries(products).filter(([, p]) => p.stock <= 3).map(([n, p]) => `${n} (เหลือ ${p.stock})`);

  // Best seller
  let topSeller = "";
  let maxSold = -1;
  Object.entries(sold).forEach(([name, count]) => {
    if (count > maxSold) { maxSold = count; topSeller = name; }
  });

  if (qLower.includes("กำไร") || qLower.includes("สูงสุด")) {
    return `จากการวิเคราะห์โครงสร้างต้นทุน เมนูที่ทำกำไรสูงสุดในร้านคือ <strong>"${bestMarginProd}"</strong> มีอัตรากำไรสูงถึง <strong>${Math.round(highestMargin * 100)}%</strong> (ขาย ฿${products[bestMarginProd].price} ต้นทุน ฿${products[bestMarginProd].cost}) เมนูนี้ควรได้รับการเชียร์ขายหน้าร้านเป็นอันดับแรกครับ!`;
  }

  if (qLower.includes("เติมสต็อก") || qLower.includes("ด่วน") || qLower.includes("ของขาด")) {
    if (lowStock.length > 0) {
      return `⚠️ สินค้าที่ต้องเติมด่วนที่สุดคือ: <strong>${lowStock.join(", ")}</strong> เนื่องจากสต็อกเหลือน้อยกว่าเกณฑ์ความปลอดภัย คุณสามารถกดปุ่ม <strong>'⚡ เติมตามที่ AI แนะนำ'</strong> ได้ทันทีครับ`;
    }
    return `✅ ระบบตรวจสอบแล้ว สต็อกสินค้าทุกรายการยังอยู่ในระดับปลอดภัย ไม่มีรายการใดที่วิกฤตครับ`;
  }

  if (qLower.includes("โปรโมชั่น") || qLower.includes("บ่าย") || qLower.includes("กระตุ้น")) {
    return `💡 แนะนำให้จัดโปรโมชั่น <strong>Happy Hour ช่วง 14:00 - 16:00 น.</strong> โดยจับคู่เซ็ต <strong>"${topSeller || 'ชานม'} + ครัวซองต์/เค้ก"</strong> ลดพิเศษ 10 บาท จะช่วยดึงดูดลูกค้าช่วงบ่ายและเพิ่ม Basket Size ต่อบิลขึ้นได้อีก ~25% ครับ`;
  }

  if (qLower.includes("ความเสี่ยง") || qLower.includes("ปรับปรุง") || qLower.includes("จุดอ่อน")) {
    const zeroStock = Object.entries(products).filter(([, p]) => p.stock === 0).map(([n]) => n);
    if (zeroStock.length > 0) {
      return `🚨 จุดเสี่ยงสำคัญที่สุดตอนนี้คือมีสินค้าหมดสต็อก (${zeroStock.join(", ")}) ทำให้เสียโอกาสขายลูกค้าทันที ควรรีบปรับรอบการสั่งวัตถุดิบให้เร็วขึ้นครับ`;
    }
    return `📊 ตอนนี้ร้านทำงานได้ดีมาก จุดที่ควรเพิ่มคือการเสนอขาย Add-on (เช่น เพิ่มช็อตกาแฟ หรือ ขนมทานคู่) เพื่อเพิ่มยอดขายต่อหัวให้สูงขึ้นครับ`;
  }

  if (qLower.includes("แนวโน้ม") || qLower.includes("วันนี้") || qLower.includes("ยอดขาย")) {
    return `📈 สรุปภาพรวม: วันนี้มีออเดอร์แล้วทั้งสิ้น <strong>${totalBills} บิล</strong> ยอดขายรวม <strong>฿${totalRev.toLocaleString()}</strong> กำไรขั้นต้น <strong>฿${totalProf.toLocaleString()}</strong> สินค้าที่ขายดีที่สุดคือ <strong>"${topSeller || 'ชานม'}"</strong> โดยภาพรวมธุรกิจมีสุขภาพดีครับ!`;
  }

  // Fallback smart response
  return `ผมได้ประมวลผลข้อมูลปัจจุบัน: ร้านมียอดขายรวม ฿${totalRev.toLocaleString()} จาก ${totalBills} บิล สินค้าเรือธงคือ "${topSeller || 'ชานม'}" หากต้องการข้อมูลเจาะจง สามารถคลิกปุ่มคำถามแนะนำด้านบนได้เลยครับ!`;
}

$("aiChatSendBtn").addEventListener("click", () => {
  const input = $("aiChatInput");
  askAiAdvisor(input.value);
  input.value = "";
});

$("aiChatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    askAiAdvisor(e.target.value);
    e.target.value = "";
  }
});

document.querySelectorAll(".ai-prompt-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    askAiAdvisor(btn.dataset.q);
  });
});

/* ==========================================================================
   REFRESH ALL MODULES
   ========================================================================== */
function refresh() {
  renderProducts();
  renderCart();
  renderInventory();
  renderSummary();
  // Auto-run analytics if tab is active
  if ($("tab-ai").classList.contains("active")) {
    runAutonomousAnalytics();
  }
}

// Initial Boot
loadState();
refresh();
