# -*- coding: utf-8 -*-
"""
MINI-POS | ระบบขายหน้าร้านพร้อมสมองกลคิดวิเคราะห์ (AI Business Intelligence)
"""

products = {
    "ชานม": {"price": 45, "cost": 18, "stock": 16},
    "ชาไทย": {"price": 40, "cost": 15, "stock": 14},
    "ชาเขียว": {"price": 40, "cost": 16, "stock": 8},
    "กาแฟสด": {"price": 50, "cost": 20, "stock": 5},
    "นมสดคาราเมล": {"price": 45, "cost": 18, "stock": 12},
    "เค้กช็อกโกแลต": {"price": 65, "cost": 28, "stock": 6},
    "ครัวซองต์เนยสด": {"price": 55, "cost": 24, "stock": 7}
}

cart = {}
total_price = 0
sold = {}
history = []

def ai_analyze():
    """ระบบคิดวิเคราะห์อัตโนมัติ (AI Self-Analysis Engine)"""
    print("\n" + "="*50)
    print("🧠 [AI BRAIN] ระบบคิดวิเคราะห์และประเมินธุรกิจอัตโนมัติ")
    print("="*50)
    
    total_revenue = sum(b["total"] for b in history)
    total_profit = sum(b.get("profit", 0) for b in history)
    total_orders = len(history)
    
    # 1. Health Score
    health_score = 75
    if total_revenue > 0 and (total_profit / total_revenue) >= 0.45:
        health_score += 15
    low_stocks = [name for name, p in products.items() if p["stock"] <= 3]
    health_score -= (len(low_stocks) * 5)
    health_score = max(20, min(99, health_score))
    
    print(f"📊 คะแนนสุขภาพธุรกิจ (Health Score): {health_score}/100")
    print(f"💰 ยอดขายรวม: {total_revenue:,} บาท | กำไรขั้นต้น: {total_profit:,} บาท | จำนวนบิล: {total_orders}")
    print("-" * 50)
    
    # 2. เมนูขายดี & เมนูทำกำไร
    best_seller = max(sold.items(), key=lambda x: x[1]) if sold else ("ยังไม่มี", 0)
    best_margin = max(products.items(), key=lambda x: (x[1]["price"] - x[1]["cost"]) / x[1]["price"])
    
    print(f"🔥 สินค้าขายดีที่สุด: {best_seller[0]} (ขายแล้ว {best_seller[1]} ชิ้น)")
    margin_pct = round(((best_margin[1]["price"] - best_margin[1]["cost"]) / best_margin[1]["price"]) * 100)
    print(f"💎 สินค้าทำกำไรสูงสุด: {best_margin[0]} (อัตรากำไร {margin_pct}%)")
    print("-" * 50)
    
    # 3. การพยากรณ์สต็อกหมดและการสั่งซื้อ
    print("🚨 แจ้งเตือนสต็อก & คำแนะนำสั่งซื้ออัตโนมัติ:")
    if low_stocks:
        for name in low_stocks:
            p = products[name]
            suggested = 15 - p["stock"]
            cost_need = suggested * p["cost"]
            status = "หมดสต็อก!" if p["stock"] == 0 else f"เหลือเพียง {p['stock']} ชิ้น"
            print(f"  • [{status}] {name} -> AI แนะนำเติม: +{suggested} ชิ้น (งบ {cost_need:,} บ.)")
    else:
        print("  • สต็อกสินค้าทุกรายการอยู่ในระดับปลอดภัย ไม่มีความเสี่ยงของขาด")
        
    # 4. กลยุทธ์โปรโมชั่นแนะนำ
    print("-" * 50)
    print("💡 ข้อเสนอแนะโปรโมชั่นกระตุ้นยอดขาย:")
    print("  • จัดเซ็ต Combo: กาแฟสด + ครัวซองต์เนยสด ในราคา 95 บาท (ลด 10 บาท)")
    print("  • เพื่อกระตุ้นยอดซื้อต่อบิล (AOV) ให้สูงขึ้นประมาณ +20%")
    print("="*50 + "\n")

print("="*55)
print("⚡ ยินดีต้อนรับสู่ MINIPOS พร้อมระบบคิดวิเคราะห์อัตโนมัติ")
print("="*55)

while True:
    print("\n📦 รายการสินค้าและสต็อกคงเหลือปัจจุบัน:")
    for name, p in products.items():
        status = "[หมด]" if p["stock"] == 0 else f"คงเหลือ {p['stock']} ชิ้น"
        print(f"  • {name} - {p['price']} บาท/ชิ้น ({status})")
        
    print(f"\n🛒 ตะกร้าปัจจุบัน: {len(cart)} รายการ {dict(cart)} | ยอดรวม: {total_price} บาท")
    print("-------------------------------------------------------")
    print("เลือกบริการ: 1:สั่งซื้อ 2:คิดเงิน 3:ยกเลิกตะกร้า 4:🧠AI วิเคราะห์ 5:ออก")
    
    serve_raw = input("ระบุหมายเลข (1-5): ").strip()
    if not serve_raw.isdigit():
        print("กรุณากรอกตัวเลข 1-5 เท่านั้น")
        continue
    
    serve = int(serve_raw)
    match serve:
        case 1:
            item = input("ระบุชื่อสินค้าที่ต้องการ: ").strip()
            if item in products:
                qty_raw = input(f"จำนวนชิ้นของ {item}: ").strip()
                if qty_raw.isdigit():
                    qty = int(qty_raw)
                    if 0 < qty <= products[item]["stock"]:
                        products[item]["stock"] -= qty
                        cart[item] = cart.get(item, 0) + qty
                        total_price += products[item]["price"] * qty
                        print(f"✅ เพิ่ม {item} จำนวน {qty} ชิ้น เข้าตะกร้าเรียบร้อย")
                    else:
                        print("❌ สต็อกคงเหลือไม่เพียงพอ หรือกรอกจำนวนไม่ถูกต้อง")
                else:
                    print("❌ กรุณากรอกจำนวนเป็นตัวเลข")
            else:
                print("❌ ไม่พบสินค้านี้ในระบบ")
                
        case 2:
            if not cart:
                print("⚠️ ยังไม่มีสินค้าในตะกร้า")
                continue
                
            print("\n🧾 สรุปรายการสินค้าที่จะชำระเงิน:")
            profit_this_bill = 0
            for name, amount in cart.items():
                p = products[name]
                line_total = p["price"] * amount
                profit_this_bill += (p["price"] - p["cost"]) * amount
                print(f"  - {name} x {amount} ชิ้น = {line_total} บาท")
                
            print(f"💰 ยอดรวมสุทธิ: {total_price} บาท")
            pay_raw = input("กรุณากรอกจำนวนเงินที่รับชำระ: ").strip()
            if pay_raw.isdigit():
                pay = int(pay_raw)
                if pay >= total_price:
                    change = pay - total_price
                    print(f"✅ ชำระเงินสำเร็จ! เงินทอน: {change} บาท")
                    # Save order
                    for name, amount in cart.items():
                        sold[name] = sold.get(name, 0) + amount
                    history.append({
                        "total": total_price,
                        "profit": profit_this_bill,
                        "items": dict(cart)
                    })
                    cart = {}
                    total_price = 0
                else:
                    print(f"❌ ยอดเงินไม่พอ (ขาดอีก {total_price - pay} บาท)")
            else:
                print("❌ กรุณาระบุจำนวนเงินเป็นตัวเลข")
                
        case 3:
            if cart:
                for name, amount in cart.items():
                    products[name]["stock"] += amount
                cart = {}
                total_price = 0
                print("🔄 ยกเลิกรายการและคืนสต็อกทั้งหมดเรียบร้อย")
            else:
                print("ยังไม่มีสินค้าในตะกร้า")
                
        case 4:
            ai_analyze()
            
        case 5:
            print("ขอบคุณที่ใช้บริการ MINIPOS ลาก่อนครับ!")
            break
            
        case _:
            print("กรุณาเลือกหมายเลข 1 ถึง 5 เท่านั้น")
