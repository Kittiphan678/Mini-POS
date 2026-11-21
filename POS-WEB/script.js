"use strict";

/* ===== ข้อมูลเริ่มต้น (เหมือน Mini-POS.py) ===== */
const INITIAL_PRODUCTS = {
  "ชานม":   { price: 45, stock: 10 },
  "ชาไทย":  { price: 40, stock: 8 },
  "ชาเขียว": { price: 40, stock: 6 },
  "กาแฟ":   { price: 50, stock: 4 }
};
const EMOJI = { "ชานม": "🧋", "ชาไทย": "🥤", "ชาเขียว": "🍵", "กาแฟ": "☕" };

let products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
let cart = {};
let totalPrice = 0;
let sold = {};      // จำนวนแก้วที่ขายแล้วแยกตามเมนู
let history = [];   // ประวัติบิลที่ชำระเงินแล้ว

const $ = (id) => document.getElementById(id);
let selectedItem = null;

/* ===== ฟังก์ชันหลัก (logic จาก Mini-POS.py) ===== */

// case 1: สั่งซื้อ
function addToCart(item, qty) {
  if (!(item in products)) {
    return { ok: false, msg: "ไม่พบสินค้านี้" };
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    return { ok: false, msg: "กรุณาระบุจำนวนเป็นจำนวนเต็มที่มากกว่า 0" };
  }
  if (qty <= products[item].stock) {
    products[item].stock -= qty;
    cart[item] = (cart[item] || 0) + qty;
    totalPrice += products[item].price * qty;
    return { ok: true, msg: `สินค้า : ${item} ถูกเพิ่มเข้าตะกร้า` };
  }
  return { ok: false, msg: "สินค้าคงเหลือไม่เพียงพอ" };
}

// ลบสินค้า 1 รายการออกจากตะกร้า (คืนสต็อก)
function removeFromCart(item) {
  if (!(item in cart)) return;
  products[item].stock += cart[item];
  totalPrice -= products[item].price * cart[item];
  delete cart[item];
}

// case 2: คิดเงิน
function checkout(pay) {
  if (Object.keys(cart).length === 0) {
    return { ok: false, msg: "ยังไม่มีสินค้าในตะกร้า" };
  }
  if (!Number.isFinite(pay)) {
    return { ok: false, msg: "กรุณากรอกจำนวนเงินที่จะชำระ" };
  }
  if (pay >= totalPrice) {
    const order = {
      no: history.length + 1,
      time: new Date().toLocaleString("th-TH"),
      items: Object.entries(cart).map(([name, amount]) => ({
        name, amount, price: products[name].price
      })),
      total: totalPrice,
      pay: pay,
      change: pay - totalPrice
    };
    order.items.forEach((i) => { sold[i.name] = (sold[i.name] || 0) + i.amount; });
    history.push(order);
    cart = {};
    totalPrice = 0;
    return { ok: true, msg: `ชำระเงินเสร็จสิ้น เงินทอน : ${order.change}`, order };
  }
  return { ok: false, msg: "ยอดเงินไม่พอ" };
}

// case 3: ยกเลิกการทำรายการ (คืนสต็อกทั้งหมด)
function cancelOrder() {
  Object.keys(cart).forEach(removeFromCart);
  cart = {};
  totalPrice = 0;
}

function resetAll() {
  products = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));
  cart = {};
  totalPrice = 0;
  sold = {};
  history = [];
}

/* ===== การแสดงผล ===== */
function toast(msg, type) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast " + (type || "");
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
}

function renderProducts() {
  const grid = $("productGrid");
  grid.innerHTML = "";
  Object.entries(products).forEach(([name, p]) => {
    const div = document.createElement("div");
    div.className = "product" + (p.stock === 0 ? " soldout" : "");
    const stockClass = p.stock === 0 ? "out" : p.stock <= 3 ? "low" : "ok";
    div.innerHTML =
      `<div class="emoji">${EMOJI[name] || "🥛"}</div>` +
      `<h3>${name}</h3>` +
      `<div class="price">฿${p.price} / แก้ว</div>` +
      `<span class="badge ${stockClass}">${p.stock === 0 ? "สินค้าหมด" : "คงเหลือ " + p.stock + " แก้ว"}</span>`;
    div.setAttribute("role", "button");
    div.setAttribute("aria-label", `สั่งซื้อ ${name} ราคา ${p.price} บาท คงเหลือ ${p.stock} แก้ว`);
    div.tabIndex = p.stock === 0 ? -1 : 0;
    div.addEventListener("click", () => openOrder(name));
    div.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openOrder(name);
      }
    });
    grid.appendChild(div);
  });
}

function renderCart() {
  const names = Object.keys(cart);
  const cups = Object.values(cart).reduce((a, b) => a + b, 0);
  $("statMenus").textContent = names.length;
  $("statCups").textContent = cups;
  $("statPrice").textContent = totalPrice;
  $("cartInfo").textContent = names.length
    ? `สินค้าในตะกร้า ${names.length} เมนู • ${cups} แก้ว`
    : "ยังไม่มีสินค้าในตะกร้า";
  const list = $("cartList");
  list.innerHTML = "";
  if (!names.length) {
    list.innerHTML = '<li class="muted">ยังไม่มีสินค้าในตะกร้า</li>';
  }
  names.forEach((name) => {
    const li = document.createElement("li");
    const sub = products[name].price * cart[name];
    li.innerHTML =
      `<span class="name">${EMOJI[name]} ${name} × ${cart[name]}</span>` +
      `<span class="sub">฿${sub}</span>`;
    const btn = document.createElement("button");
    btn.className = "btn-icon";
    btn.type = "button";
    btn.title = `ลบ ${name} ออกจากตะกร้า`;
    btn.setAttribute("aria-label", btn.title);
    btn.textContent = "×";
    btn.addEventListener("click", () => { removeFromCart(name); refresh(); toast(`ลบ ${name} ออกจากตะกร้าแล้ว`); });
    li.appendChild(btn);
    list.appendChild(li);
  });
  $("totalPrice").textContent = "฿" + totalPrice;
}

function renderSummary() {
  const totalCups = Object.values(sold).reduce((a, b) => a + b, 0);
  const revenue = history.reduce((a, o) => a + o.total, 0);
  $("sumOrders").textContent = history.length;
  $("sumCups").textContent = totalCups;
  $("sumRevenue").textContent = "฿" + revenue;
  $("stockTable").innerHTML = Object.entries(products).map(([name, p]) => {
    const status = p.stock === 0 ? "danger" : p.stock <= 3 ? "warn" : "good";
    const label = p.stock === 0 ? "หมด" : p.stock <= 3 ? "ใกล้หมด" : "พร้อมขาย";
    return `<tr><td>${EMOJI[name]} ${name}</td><td>฿${p.price}</td>` +
      `<td>${sold[name] || 0}</td><td>${p.stock}</td>` +
      `<td><span class="status-dot ${status}"></span>${label}</td></tr>`;
  }).join("");
  $("historyList").innerHTML = history.length
    ? history.slice().reverse().map((o) =>
        `<li><span class="bill-no">บิล #${o.no}</span> (${o.time}) — ` +
        `${o.items.map((i) => i.name + " ×" + i.amount).join(", ")} ` +
        `<span class="bill-total">฿${o.total}</span> | รับ ฿${o.pay} | ทอน ฿${o.change}</li>`).join("")
    : '<li class="muted">ยังไม่มีรายการขาย</li>';
}

function refresh() {
  renderProducts();
  renderCart();
  renderSummary();
}

/* ===== Modal สั่งซื้อ ===== */
function updateSubtotal() {
  const q = parseInt($("qtyInput").value, 10) || 0;
  $("orderSubtotal").textContent = selectedItem ? products[selectedItem].price * Math.max(q, 0) : 0;
}

function openOrder(name) {
  if (products[name].stock === 0) {
    toast("สินค้าคงเหลือไม่เพียงพอ", "error");
    return;
  }
  selectedItem = name;
  $("orderEmoji").textContent = EMOJI[name] || "🥛";
  $("orderTitle").textContent = `สั่งซื้อ ${name}`;
  $("orderDetail").textContent = `ราคา ${products[name].price} บาท/แก้ว | คงเหลือ ${products[name].stock} แก้ว`;
  $("qtyInput").value = 1;
  updateSubtotal();
  $("orderModal").hidden = false;
  $("qtyInput").focus();
}

function closeOrder() {
  $("orderModal").hidden = true;
  selectedItem = null;
}

/* ===== Events ===== */
$("qtyMinus").addEventListener("click", () => {
  $("qtyInput").value = Math.max(1, (parseInt($("qtyInput").value, 10) || 1) - 1);
  updateSubtotal();
});
$("qtyPlus").addEventListener("click", () => {
  $("qtyInput").value = (parseInt($("qtyInput").value, 10) || 0) + 1;
  updateSubtotal();
});
$("qtyInput").addEventListener("input", updateSubtotal);
$("orderClose").addEventListener("click", closeOrder);
$("orderConfirm").addEventListener("click", () => {
  const qty = parseInt($("qtyInput").value, 10);
  const r = addToCart(selectedItem, qty);
  toast(r.msg, r.ok ? "ok" : "error");
  if (r.ok) closeOrder();
  refresh();
});

document.querySelectorAll(".quick-pay button").forEach((b) => {
  b.addEventListener("click", () => {
    $("payInput").value = b.dataset.pay === "exact" ? totalPrice : b.dataset.pay;
  });
});

$("checkoutBtn").addEventListener("click", () => {
  const pay = parseFloat($("payInput").value);
  const r = checkout(pay);
  if (!r.ok) {
    toast(r.msg, "error");
    return;
  }
  const o = r.order;
  $("receiptBody").innerHTML =
    `<div>บิล #${o.no} | ${o.time}</div><hr>` +
    o.items.map((i) =>
      `<div class="line"><span>- ${i.name} : ${i.amount} แก้ว x ${i.price}</span><span>${i.amount * i.price}</span></div>`
    ).join("") +
    `<hr><div class="line"><strong>ยอดรวมสินค้า</strong><strong>${o.total} บาท</strong></div>` +
    `<div class="line"><span>ชำระเงิน</span><span>${o.pay} บาท</span></div>` +
    `<div class="line"><strong>เงินทอน</strong><strong>${o.change} บาท</strong></div>`;
  $("receiptModal").hidden = false;
  $("payInput").value = "";
  refresh();
});

$("receiptClose").addEventListener("click", () => { $("receiptModal").hidden = true; });

$("cancelBtn").addEventListener("click", () => {
  if (!Object.keys(cart).length) {
    toast("ยังไม่มีสินค้าในตะกร้า", "error");
    return;
  }
  cancelOrder();
  $("payInput").value = "";
  refresh();
  toast("ยกเลิกการทำรายการ ขอบคุณครับ");
});

$("resetBtn").addEventListener("click", () => {
  if (confirm("ต้องการรีเซ็ตสต็อกและยอดขายทั้งหมดหรือไม่?")) {
    resetAll();
    $("payInput").value = "";
    refresh();
    toast("รีเซ็ตข้อมูลเรียบร้อย", "ok");
  }
});

refresh();

