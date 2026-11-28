# -*- coding: utf-8 -*-
"""
MINIPOS - SQLite Database Layer
จัดการฐานข้อมูลสินค้า สต็อกสินค้า บันทึกประวัติการขาย และสรุปผล
"""

import sqlite3
import os
import time
from datetime import datetime

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pos_database.db")

INITIAL_PRODUCTS = [
    ("ชานม", "ชา", "🧋", 45.0, 18.0, 16),
    ("ชาไทย", "ชา", "🥤", 40.0, 15.0, 14),
    ("ชาเขียว", "ชา", "🍵", 40.0, 16.0, 8),
    ("กาแฟสด", "กาแฟ", "☕", 50.0, 20.0, 5),
    ("นมสดคาราเมล", "นมสด", "🥛", 45.0, 18.0, 12),
    ("เค้กช็อกโกแลต", "ขนม", "🍰", 65.0, 28.0, 6),
    ("ครัวซองต์เนยสด", "ขนม", "🥐", 55.0, 24.0, 7)
]


def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """สร้างตารางในฐานข้อมูล SQLite และใส่ข้อมูลเริ่มต้นหากยังไม่มีข้อมูล"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # ตารางสินค้า
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                category TEXT NOT NULL,
                emoji TEXT DEFAULT '🥤',
                price REAL NOT NULL,
                cost REAL NOT NULL DEFAULT 0,
                stock INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # ตารางคำสั่งซื้อ (บิลการขาย)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bill_no TEXT UNIQUE NOT NULL,
                order_time TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                hour INTEGER NOT NULL,
                subtotal REAL NOT NULL,
                discount REAL DEFAULT 0,
                total REAL NOT NULL,
                profit REAL NOT NULL,
                pay_amount REAL NOT NULL,
                change_amount REAL NOT NULL,
                payment_method TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # ตารางรายการสินค้าในแต่ละบิล
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_name TEXT NOT NULL,
                sweet_level TEXT DEFAULT '50%',
                amount INTEGER NOT NULL,
                price REAL NOT NULL,
                cost REAL NOT NULL DEFAULT 0,
                total REAL NOT NULL
            )
        """)
        
        # ตรวจสอบว่ามีข้อมูลสินค้าหรือยัง ถ้ายังไม่มีให้เพิ่ม INITIAL_PRODUCTS
        cursor.execute("SELECT COUNT(*) FROM products")
        if cursor.fetchone()[0] == 0:
            cursor.executemany("""
                INSERT INTO products (name, category, emoji, price, cost, stock)
                VALUES (?, ?, ?, ?, ?, ?)
            """, INITIAL_PRODUCTS)
        
        conn.commit()


def get_all_products():
    """ดึงข้อมูลสินค้าทั้งหมด พร้อมยอดขายสะสม (sold count) ของแต่ละสินค้า"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.*, 
                   COALESCE((SELECT SUM(amount) FROM order_items WHERE product_name = p.name), 0) AS sold_count
            FROM products p
            ORDER BY p.id ASC
        """)
        rows = cursor.fetchall()
        
        products_dict = {}
        for r in rows:
            products_dict[r["name"]] = {
                "id": r["id"],
                "name": r["name"],
                "category": r["category"],
                "emoji": r["emoji"],
                "price": float(r["price"]),
                "cost": float(r["cost"]),
                "stock": int(r["stock"]),
                "sold": int(r["sold_count"])
            }
        return products_dict


def add_or_update_product(name, category, emoji, price, cost, stock, edit_key=None):
    """เพิ่มสินค้าใหม่ หรืออัปเดตข้อมูลสินค้าเดิม"""
    name = (name or "").strip()
    if not name:
        raise ValueError("ชื่อสินค้าต้องไม่เป็นค่าว่าง")
        
    price = float(price)
    cost = float(cost)
    stock = max(0, int(stock))
    emoji = (emoji or "🥤").strip()
    category = (category or "ทั่วไป").strip()
    
    with get_db() as conn:
        cursor = conn.cursor()
        if edit_key:
            # แก้ไขสินค้าเดิม
            cursor.execute("""
                UPDATE products 
                SET name = ?, category = ?, emoji = ?, price = ?, cost = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
                WHERE name = ?
            """, (name, category, emoji, price, cost, stock, edit_key))
            if cursor.rowcount == 0:
                raise ValueError(f"ไม่พบสินค้า '{edit_key}' สำหรับการแก้ไข")
        else:
            # เพิ่มสินค้าใหม่
            try:
                cursor.execute("""
                    INSERT INTO products (name, category, emoji, price, cost, stock)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (name, category, emoji, price, cost, stock))
            except sqlite3.IntegrityError:
                raise ValueError(f"มีสินค้าชื่อ '{name}' ในระบบแล้ว")
        conn.commit()
    return {"ok": True, "name": name}


def delete_product(name):
    """ลบสินค้าออกจากระบบ"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM products WHERE name = ?", (name,))
        if cursor.rowcount == 0:
            raise ValueError(f"ไม่พบสินค้า '{name}'")
        conn.commit()
    return {"ok": True, "message": f"ลบสินค้า '{name}' สำเร็จ"}


def adjust_stock(name, delta=0, new_stock=None):
    """ปรับสต็อกสินค้า: เพิ่ม/ลด ตาม delta หรือระบุจำนวนใหม่โดยตรง"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT stock FROM products WHERE name = ?", (name,))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"ไม่พบสินค้า '{name}'")
        
        current_stock = row[0]
        if new_stock is not None:
            updated_stock = max(0, int(new_stock))
        else:
            updated_stock = max(0, current_stock + int(delta))
            
        cursor.execute("""
            UPDATE products 
            SET stock = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE name = ?
        """, (updated_stock, name))
        conn.commit()
    return {"ok": True, "name": name, "stock": updated_stock}


def checkout_order(order_data):
    """
    ตัดสต็อกและบันทึกการขาย (Order Checkout) ด้วย ACID Transaction
    หากสินค้าใดสต็อกไม่พอ จะ Rollback ทันที ป้องกันสต็อกติดลบหรือผิดพลาด
    """
    items = order_data.get("items", [])
    if not items:
        raise ValueError("ไม่มีรายการสินค้าในตะกร้า")
        
    payment_method = order_data.get("method", "เงินสด")
    subtotal = float(order_data.get("subtotal", 0))
    discount = float(order_data.get("discount", 0))
    total = float(order_data.get("total", subtotal - discount))
    pay_amount = float(order_data.get("pay", total))
    change_amount = max(0.0, pay_amount - total)
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. ตรวจสอบสต็อกของทุกชิ้นก่อนตัดจริง
        for item in items:
            p_name = item.get("name")
            p_qty = int(item.get("amount", item.get("qty", 1)))
            
            cursor.execute("SELECT stock, price, cost FROM products WHERE name = ?", (p_name,))
            prod = cursor.fetchone()
            if not prod:
                raise ValueError(f"ไม่พบสินค้า '{p_name}' ในฐานข้อมูล")
            if prod["stock"] < p_qty:
                raise ValueError(f"สินค้า '{p_name}' มีสต็อกคงเหลือ {prod['stock']} ชิ้น ไม่เพียงพอต่อจำนวนที่สั่ง ({p_qty} ชิ้น)")

        # 2. ทำการตัดสต็อกสินค้าในตาราง products
        calculated_profit = 0.0
        for item in items:
            p_name = item.get("name")
            p_qty = int(item.get("amount", item.get("qty", 1)))
            cursor.execute("""
                UPDATE products 
                SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP 
                WHERE name = ?
            """, (p_qty, p_name))
            
            # คำนวณต้นทุน/กำไร
            item_price = float(item.get("price", 0))
            item_cost = float(item.get("cost", 0))
            calculated_profit += (item_price - item_cost) * p_qty

        # หักส่วนลดออกจากกำไร
        final_profit = calculated_profit - discount
        
        # 3. กำหนดเลขที่บิล (เช่น #0001)
        cursor.execute("SELECT COUNT(*) FROM orders")
        order_count = cursor.fetchone()[0] + 1
        bill_no = f"#{order_count:04d}"
        
        now = datetime.now()
        order_time_str = now.strftime("%d/%m/%Y, %H:%M:%S")
        timestamp = int(time.time() * 1000)
        hour = now.hour

        # 4. บันทึกลงตาราง orders
        cursor.execute("""
            INSERT INTO orders (
                bill_no, order_time, timestamp, hour, subtotal, discount, total, profit,
                pay_amount, change_amount, payment_method
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            bill_no, order_time_str, timestamp, hour, subtotal, discount, total, final_profit,
            pay_amount, change_amount, payment_method
        ))
        order_id = cursor.lastrowid
        
        # 5. บันทึกรายการลงตาราง order_items
        for item in items:
            p_name = item.get("name")
            p_qty = int(item.get("amount", item.get("qty", 1)))
            p_price = float(item.get("price", 0))
            p_cost = float(item.get("cost", 0))
            p_sweet = item.get("sweet", "50%")
            item_total = p_price * p_qty
            
            cursor.execute("""
                INSERT INTO order_items (
                    order_id, product_name, sweet_level, amount, price, cost, total
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (order_id, p_name, p_sweet, p_qty, p_price, p_cost, item_total))
            
        conn.commit()

        # จัดเตรียมข้อมูลออร์เดอร์ที่สร้างเสร็จสมบูรณ์ส่งกลับ
        saved_order = {
            "id": order_id,
            "no": order_count,
            "bill_no": bill_no,
            "time": order_time_str,
            "timestamp": timestamp,
            "hour": hour,
            "subtotal": subtotal,
            "discount": discount,
            "total": total,
            "profit": final_profit,
            "pay": pay_amount,
            "change": change_amount,
            "method": payment_method,
            "items": [
                {
                    "name": it.get("name"),
                    "sweet": it.get("sweet", "50%"),
                    "amount": int(it.get("amount", it.get("qty", 1))),
                    "price": float(it.get("price", 0)),
                    "cost": float(it.get("cost", 0)),
                    "total": float(it.get("price", 0)) * int(it.get("amount", it.get("qty", 1)))
                }
                for it in items
            ]
        }
        return saved_order


def get_orders(search=None, limit=200):
    """ดึงรายการประวัติบิลการขายพร้อมรายการสินค้าในแต่ละบิล"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        sql = "SELECT * FROM orders ORDER BY id DESC"
        params = []
        if search:
            sql = "SELECT * FROM orders WHERE bill_no LIKE ? ORDER BY id DESC"
            params = [f"%{search}%"]
            
        if limit:
            sql += f" LIMIT {int(limit)}"
            
        cursor.execute(sql, params)
        order_rows = cursor.fetchall()
        
        orders_list = []
        for o in order_rows:
            # ดึง items ของแต่ละ order
            cursor.execute("""
                SELECT product_name, sweet_level, amount, price, cost, total
                FROM order_items
                WHERE order_id = ?
            """, (o["id"],))
            item_rows = cursor.fetchall()
            
            items = [
                {
                    "name": ir["product_name"],
                    "sweet": ir["sweet_level"],
                    "amount": int(ir["amount"]),
                    "price": float(ir["price"]),
                    "cost": float(ir["cost"]),
                    "total": float(ir["total"])
                }
                for ir in item_rows
            ]
            
            # ถ้ามีการค้นหาชื่อเมนู และบิลไม่ได้ match bill_no ให้กรองตามชื่อเมนู
            if search and not search.lower() in o["bill_no"].lower():
                has_matched_item = any(search.lower() in it["name"].lower() for it in items)
                if not has_matched_item:
                    continue
            
            orders_list.append({
                "id": o["id"],
                "no": o["id"],
                "bill_no": o["bill_no"],
                "time": o["order_time"],
                "timestamp": o["timestamp"],
                "hour": o["hour"],
                "subtotal": float(o["subtotal"]),
                "discount": float(o["discount"]),
                "total": float(o["total"]),
                "profit": float(o["profit"]),
                "pay": float(o["pay_amount"]),
                "change": float(o["change_amount"]),
                "method": o["payment_method"],
                "items": items
            })
            
        return orders_list


def get_summary():
    """สรุปผลและรายงานภาพรวมธุรกิจ (KPI, สต็อก, สินค้าขายดี, ยอดขาย, กำไร)"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 1. ภาพรวมบิลและยอดขาย
        cursor.execute("""
            SELECT 
                COUNT(*) as total_orders,
                COALESCE(SUM(total), 0) as total_revenue,
                COALESCE(SUM(profit), 0) as total_profit
            FROM orders
        """)
        stats = cursor.fetchone()
        total_orders = stats["total_orders"]
        total_revenue = float(stats["total_revenue"])
        total_profit = float(stats["total_profit"])
        aov = round(total_revenue / total_orders, 2) if total_orders > 0 else 0.0
        
        # 2. จำนวนชิ้น/แก้วที่ขายได้ทั้งหมด
        cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM order_items")
        total_cups = int(cursor.fetchone()[0])
        
        # 3. ยอดขายแยกตามสินค้า (Sold by product)
        cursor.execute("""
            SELECT product_name, SUM(amount) as sold_amount, SUM(total) as revenue_amount
            FROM order_items
            GROUP BY product_name
            ORDER BY sold_amount DESC
        """)
        sold_rows = cursor.fetchall()
        sold_map = {r["product_name"]: int(r["sold_amount"]) for r in sold_rows}
        top_sellers = [
            {"name": r["product_name"], "sold": int(r["sold_amount"]), "revenue": float(r["revenue_amount"])}
            for r in sold_rows
        ]
        
        # 4. สถานะสต็อก
        cursor.execute("SELECT name, stock, cost FROM products WHERE stock = 0")
        out_of_stock = [{"name": r["name"], "stock": 0, "cost": float(r["cost"])} for r in cursor.fetchall()]
        
        cursor.execute("SELECT name, stock, cost FROM products WHERE stock > 0 AND stock <= 3")
        low_stock = [{"name": r["name"], "stock": int(r["stock"]), "cost": float(r["cost"])} for r in cursor.fetchall()]
        
        cursor.execute("SELECT COUNT(*) FROM products")
        total_products_count = cursor.fetchone()[0]
        
        return {
            "total_orders": total_orders,
            "total_cups": total_cups,
            "total_revenue": total_revenue,
            "total_profit": total_profit,
            "aov": aov,
            "sold": sold_map,
            "top_sellers": top_sellers,
            "out_of_stock": out_of_stock,
            "low_stock": low_stock,
            "total_products": total_products_count
        }


def reset_database():
    """รีเซ็ตระบบ: เคลียร์บิลทั้งหมด และตั้งค่าสินค้าเริ่มต้นพร้อมสต็อกใหม่"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM order_items")
        cursor.execute("DELETE FROM orders")
        cursor.execute("DELETE FROM products")
        cursor.executemany("""
            INSERT INTO products (name, category, emoji, price, cost, stock)
            VALUES (?, ?, ?, ?, ?, ?)
        """, INITIAL_PRODUCTS)
        conn.commit()
    return {"ok": True, "message": "รีเซ็ตฐานข้อมูลเป็นค่าเริ่มต้นเรียบร้อย"}


def generate_demo_orders(count=30):
    """สร้างข้อมูลยอดขายจำลองลงฐานข้อมูล SQLite พร้อมตัดสต็อกสมจริง"""
    import random
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name, price, cost, stock FROM products")
        prods = [dict(r) for r in cursor.fetchall()]
        if not prods:
            return {"ok": False, "message": "ไม่มีสินค้าในระบบ"}
            
        sweets = ["100%", "50%", "25%", "0%"]
        methods = ["เงินสด", "QR พร้อมเพย์", "บัตร/เงินโอน"]
        now = time.time()
        
        # เพิ่มสต็อกชั่วคราวให้เพียงพอสำหรับการจำลอง
        cursor.execute("UPDATE products SET stock = stock + 50")
        
        for i in range(count):
            hours_ago = random.randint(0, 8)
            t_stamp = int((now - (hours_ago * 3600) - random.randint(0, 3500)) * 1000)
            order_dt = datetime.fromtimestamp(t_stamp / 1000)
            time_str = order_dt.strftime("%d/%m/%Y, %H:%M:%S")
            hour = order_dt.hour
            
            item_count = random.randint(1, 3)
            picked_prods = random.sample(prods, min(item_count, len(prods)))
            
            sub = 0.0
            cost_tot = 0.0
            items = []
            for p in picked_prods:
                qty = random.randint(1, 2)
                p_price = float(p["price"])
                p_cost = float(p["cost"])
                p_name = p["name"]
                
                # ตัดสต็อก
                cursor.execute("UPDATE products SET stock = MAX(0, stock - ?) WHERE name = ?", (qty, p_name))
                
                sub += p_price * qty
                cost_tot += p_cost * qty
                items.append({
                    "name": p_name,
                    "sweet": random.choice(sweets),
                    "amount": qty,
                    "price": p_price,
                    "cost": p_cost,
                    "total": p_price * qty
                })
                
            cursor.execute("SELECT COUNT(*) FROM orders")
            bill_num = cursor.fetchone()[0] + 1
            bill_no = f"#{bill_num:04d}"
            
            profit = sub - cost_tot
            pay = int(round((sub + 49) / 50)) * 50
            change = pay - sub
            method = random.choice(methods)
            
            cursor.execute("""
                INSERT INTO orders (
                    bill_no, order_time, timestamp, hour, subtotal, discount, total, profit,
                    pay_amount, change_amount, payment_method
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (bill_no, time_str, t_stamp, hour, sub, 0, sub, profit, pay, change, method))
            order_id = cursor.lastrowid
            
            for it in items:
                cursor.execute("""
                    INSERT INTO order_items (
                        order_id, product_name, sweet_level, amount, price, cost, total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (order_id, it["name"], it["sweet"], it["amount"], it["price"], it["cost"], it["total"]))
                
        conn.commit()
    return {"ok": True, "message": f"จำลองข้อมูลการขาย {count} บิล บันทึกลงฐานข้อมูลเรียบร้อย"}


if __name__ == "__main__":
    init_db()
    print("Database initialized successfully.")
    print("Initial Products:", get_all_products())
