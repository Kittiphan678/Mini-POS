# -*- coding: utf-8 -*-
"""
Test script for MINIPOS Backend & Database
"""
import sys
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
import database

def run_tests():
    print("--- TEST 1: Init Database ---")
    database.init_db()
    prods = database.get_all_products()
    print(f"Products count: {len(prods)}")
    assert len(prods) >= 7, "Should have at least 7 initial products"
    print("Test 1 Passed: Initial products loaded.")

    print("\n--- TEST 2: Add New Product ---")
    res = database.add_or_update_product(
        name="มัทฉะลาเต้พรีเมียม",
        category="ชา",
        emoji="🍵",
        price=65.0,
        cost=25.0,
        stock=20
    )
    assert res["ok"] is True
    prods = database.get_all_products()
    assert "มัทฉะลาเต้พรีเมียม" in prods
    assert prods["มัทฉะลาเต้พรีเมียม"]["stock"] == 20
    print("Test 2 Passed: Added 'มัทฉะลาเต้พรีเมียม' with stock 20.")

    print("\n--- TEST 3: Adjust Stock ---")
    res = database.adjust_stock("มัทฉะลาเต้พรีเมียม", delta=5)
    assert res["stock"] == 25
    print("Test 3 Passed: Adjusted stock to 25.")

    print("\n--- TEST 4: Checkout & Stock Deduction ---")
    initial_stock = database.get_all_products()["มัทฉะลาเต้พรีเมียม"]["stock"]
    order_data = {
        "items": [
            {"name": "มัทฉะลาเต้พรีเมียม", "sweet": "25%", "amount": 3, "price": 65.0, "cost": 25.0}
        ],
        "subtotal": 195.0,
        "discount": 10.0,
        "total": 185.0,
        "pay": 200.0,
        "method": "เงินสด"
    }
    saved_order = database.checkout_order(order_data)
    bill_no = saved_order["bill_no"]
    new_stock = database.get_all_products()["มัทฉะลาเต้พรีเมียม"]["stock"]
    assert new_stock == initial_stock - 3, f"Stock should decrease by 3 (from {initial_stock} to {new_stock})"
    print(f"Test 4 Passed: Stock deducted {initial_stock} -> {new_stock}, Bill: {bill_no}")

    print("\n--- TEST 5: Insufficient Stock Protection ---")
    try:
        bad_order = {
            "items": [{"name": "มัทฉะลาเต้พรีเมียม", "amount": 9999, "price": 65.0, "cost": 25.0}],
            "subtotal": 649935.0,
            "total": 649935.0
        }
        database.checkout_order(bad_order)
        assert False, "Should have failed with insufficient stock"
    except ValueError as e:
        print(f"Test 5 Passed: Correctly blocked over-order: {e}")

    print("\n--- TEST 6: Get Orders & Summary ---")
    orders = database.get_orders()
    assert len(orders) >= 1
    summary = database.get_summary()
    assert summary["total_orders"] >= 1
    assert summary["total_cups"] >= 3
    assert summary["sold"]["มัทฉะลาเต้พรีเมียม"] >= 3
    print(f"Test 6 Passed: Summary has {summary['total_orders']} orders, revenue ฿{summary['total_revenue']}, cups {summary['total_cups']}")

    print("\n--- TEST 7: Delete Product ---")
    del_res = database.delete_product("มัทฉะลาเต้พรีเมียม")
    assert del_res["ok"] is True
    prods_after = database.get_all_products()
    assert "มัทฉะลาเต้พรีเมียม" not in prods_after
    print("Test 7 Passed: Successfully deleted test product.")

    print("\n🎉 ALL 7 TESTS PASSED SUCCESSFULLY! EVERYTHING WORKS AS EXPECTED.")

if __name__ == "__main__":
    run_tests()
