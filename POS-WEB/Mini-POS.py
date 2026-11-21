products = {
    "ชานม" :{"price":45,"stock":10},
    "ชาไทย" :{"price":40,"stock":8},
    "ชาเขียว" :{"price":40,"stock":6},
    "กาแฟ" :{"price":50,"stock":4}
}
cart = {}
total_price = 0
while True:
    print (products)
    print (f"ตอนนี้คุณมีสินค้าในตะกล้า : {len(cart)} มีเมน : {list(cart.keys())} จำนวน : {list(cart.values())}")
    serve = int(input("โปรดระบุบริการ 1:สั่งซื้อ 2:คิดเงิน 3:exit :").strip())
    match serve:
        case 1:
            items = input("สินค้าที่ลูกค้าต้องการ : ").strip()
            if items in products:
                qty = int(input("จำนวน (แก้ว) : ").strip())
                if qty <= products[items]["stock"]:
                    print (f"สินค้า : {items} ถูกเพิ่มเช้าตะกล้า")
                    products[items]["stock"] -= qty
                    cart[items] = cart.get(items,0) + qty
                    total_price += products[items]["price"] * qty
                else:
                    print("สินค้าคงเหลือไม่เพียงพอ")
        case 2:
            for name ,amount in cart.items():
                print(f"- {name} : {amount} แก้ว")
            print (f"ยอดรวมสินค้า : {total_price}")
            pay = int(input("กรุณากรอกจำนวนเงินที่จะชำระ : ").strip())
            if pay >= total_price:
                print (f"ชำระเงินเสร็จสิ้น เงินทอน : {pay-total_price}")
                break
            else :
                print ("ยอดเงินไม่พอ")
        case 3:
            print("ยกเลิกการทำรายการ ขอบคุณครับ")
            break
        case _:
            print("กรุณาเลือกหมายเลข 1, 2 หรือ 3 เท่านั้น")
    
