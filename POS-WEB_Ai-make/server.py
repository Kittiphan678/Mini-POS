# -*- coding: utf-8 -*-
"""
MINIPOS AI - Backend Server & REST API
รองรับการจัดการสินค้า, บันทึกการขายตัดสต็อกแบบ ACID, รายงานสรุปผล และเสิร์ฟหน้าเว็บ
ทำงานได้ทันทีด้วย Python Standard Library (ไม่ต้องลงไลบรารีเสริม)
"""

import http.server
import json
import os
import sys
import urllib.parse
from http import HTTPStatus

# โหลดโมดูลฐานข้อมูล SQLite
import database

PORT = 8000
HOST = "0.0.0.0"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class PosApiHandler(http.server.SimpleHTTPRequestHandler):
    """Handler จัดการทั้ง REST API และเสิร์ฟไฟล์ Static Web (HTML, CSS, JS)"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def _send_json(self, data, status_code=HTTPStatus.OK):
        """ส่ง Response กลับเป็น JSON พร้อม CORS Headers"""
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        """อ่าน Request Body แล้วแปลงเป็น Python Dict"""
        content_length = int(self.headers.get("Content-Length", 0))
        if content_length == 0:
            return {}
        raw_body = self.rfile.read(content_length).decode("utf-8")
        try:
            return json.loads(raw_body)
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):
        """รองรับ Preflight CORS Request"""
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    # =========================================================================
    # GET REQUEST ROUTING
    # =========================================================================
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. API: Server Health & Status
        if path == "/api/status":
            try:
                products = database.get_all_products()
                summary = database.get_summary()
                self._send_json({
                    "ok": True,
                    "status": "online",
                    "server": "MINIPOS AI Server v2.0",
                    "database": "SQLite (pos_database.db)",
                    "total_products": len(products),
                    "total_orders": summary["total_orders"],
                    "total_revenue": summary["total_revenue"]
                })
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # 2. API: ดึงรายการสินค้าทั้งหมด
        elif path == "/api/products":
            try:
                products = database.get_all_products()
                self._send_json({"ok": True, "products": products})
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # 3. API: ดึงประวัติบิลการขาย
        elif path in ("/api/orders", "/api/history"):
            try:
                search = query.get("search", [None])[0]
                limit = query.get("limit", [200])[0]
                orders = database.get_orders(search=search, limit=limit)
                self._send_json({"ok": True, "orders": orders})
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # 4. API: ดึงข้อมูลสรุปผลและรายงานภาพรวม (KPI / สต็อก / เมนูขายดี)
        elif path == "/api/summary":
            try:
                summary = database.get_summary()
                self._send_json({"ok": True, "summary": summary})
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # หากไม่ใช่ /api/... ให้ส่งไปยัง SimpleHTTPRequestHandler เสิร์ฟไฟล์ Static
        super().do_GET()

    # =========================================================================
    # POST REQUEST ROUTING
    # =========================================================================
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        # 1. API: เพิ่มหรือแก้ไขสินค้า
        if path == "/api/products":
            try:
                name = body.get("name")
                category = body.get("category", "ชา")
                emoji = body.get("emoji", "🥤")
                price = float(body.get("price", 0))
                cost = float(body.get("cost", 0))
                stock = int(body.get("stock", 0))
                edit_key = body.get("edit_key") or None

                res = database.add_or_update_product(name, category, emoji, price, cost, stock, edit_key=edit_key)
                updated_products = database.get_all_products()
                self._send_json({"ok": True, "result": res, "products": updated_products})
            except ValueError as ve:
                self._send_json({"ok": False, "error": str(ve)}, HTTPStatus.BAD_REQUEST)
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # 2. API: ลบสินค้า
        elif path == "/api/products/delete":
            try:
                name = body.get("name")
                if not name:
                    self._send_json({"ok": False, "error": "ต้องระบุชื่อสินค้าที่จะลบ"}, HTTPStatus.BAD_REQUEST)
                    return
                res = database.delete_product(name)
                updated_products = database.get_all_products()
                self._send_json({"ok": True, "result": res, "products": updated_products})
            except ValueError as ve:
                self._send_json({"ok": False, "error": str(ve)}, HTTPStatus.NOT_FOUND)
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # 3. API: ปรับสต็อกสินค้าด่วน (+5, +10, -1, หรือระบุจำนวนใหม่)
        elif path == "/api/products/adjust-stock":
            try:
                name = body.get("name")
                delta = int(body.get("delta", 0))
                new_stock = body.get("stock", None)
                res = database.adjust_stock(name, delta=delta, new_stock=new_stock)
                updated_products = database.get_all_products()
                self._send_json({"ok": True, "result": res, "products": updated_products})
            except ValueError as ve:
                self._send_json({"ok": False, "error": str(ve)}, HTTPStatus.BAD_REQUEST)
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # 4. API: ชำระเงินและตัดสต็อกสินค้า (Checkout Order)
        elif path in ("/api/checkout", "/api/orders"):
            try:
                # ทำการตัดสต็อกและบันทึกออร์เดอร์ลงฐานข้อมูล
                saved_order = database.checkout_order(body)
                updated_products = database.get_all_products()
                summary = database.get_summary()
                self._send_json({
                    "ok": True,
                    "order": saved_order,
                    "products": updated_products,
                    "summary": summary
                })
            except ValueError as ve:
                # กรณีสต็อกไม่พอ หรือข้อมูลไม่ถูกต้อง
                self._send_json({"ok": False, "error": str(ve)}, HTTPStatus.BAD_REQUEST)
            except Exception as e:
                self._send_json({"ok": False, "error": f"เกิดข้อผิดพลาดภายในระบบ: {str(e)}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # 5. API: จำลองข้อมูลการขาย 30 บิล (Demo Data)
        elif path == "/api/demo-data":
            try:
                res = database.generate_demo_orders(30)
                updated_products = database.get_all_products()
                orders = database.get_orders(limit=200)
                summary = database.get_summary()
                self._send_json({
                    "ok": True,
                    "result": res,
                    "products": updated_products,
                    "orders": orders,
                    "summary": summary
                })
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # 6. API: รีเซ็ตระบบกลับเป็นค่าเริ่มต้น
        elif path == "/api/reset":
            try:
                res = database.reset_database()
                updated_products = database.get_all_products()
                orders = database.get_orders(limit=200)
                summary = database.get_summary()
                self._send_json({
                    "ok": True,
                    "result": res,
                    "products": updated_products,
                    "orders": orders,
                    "summary": summary
                })
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        else:
            self._send_json({"ok": False, "error": "Endpoint not found"}, HTTPStatus.NOT_FOUND)

    # =========================================================================
    # DELETE REQUEST ROUTING
    # =========================================================================
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/products/"):
            # ตัวอย่าง /api/products/ชานม
            product_name = urllib.parse.unquote(path[len("/api/products/"):])
            try:
                res = database.delete_product(product_name)
                updated_products = database.get_all_products()
                self._send_json({"ok": True, "result": res, "products": updated_products})
            except ValueError as ve:
                self._send_json({"ok": False, "error": str(ve)}, HTTPStatus.NOT_FOUND)
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        else:
            self._send_json({"ok": False, "error": "Endpoint not found"}, HTTPStatus.NOT_FOUND)


def run_server(port=PORT):
    # เริ่มต้นฐานข้อมูล SQLite หากยังไม่มีตาราง
    database.init_db()

    # ใช้ ThreadingHTTPServer เพื่อรองรับหลาย Request พร้อมกันได้อย่างราบรื่น
    server_address = (HOST, port)
    httpd = http.server.ThreadingHTTPServer(server_address, PosApiHandler)

    print("=" * 60)
    print(f"🚀 MINIPOS AI Backend Server กำลังทำงาน!")
    print(f"📡 Web & REST API: http://localhost:{port}")
    print(f"💾 SQLite Database: {database.DB_FILE}")
    print(f"⏹️  กด Ctrl+C เพื่อหยุดการทำงานของเซิร์ฟเวอร์")
    print("=" * 60)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 หยุดการทำงานของเซิร์ฟเวอร์เรียบร้อย")
        httpd.server_close()


if __name__ == "__main__":
    port = PORT
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    run_server(port)
