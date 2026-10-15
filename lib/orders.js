export const ORDERS = {
  "ORD-101": {
    order_id: "ORD-101",
    customer: "Priya Sharma",
    product: "Vitamin C Serum (30ml)",
    value: 699,
    status: "Out for Delivery",
    notes: "BlueDart — BD-982103. Expected by 6 PM today",
  },
  "ORD-102": {
    order_id: "ORD-102",
    customer: "Rahul Verma",
    product: "Hydrating Sunscreen SPF 50",
    value: 499,
    status: "Delivered",
    notes: "Delhivery — DL-441029. Delivered 14 days ago",
  },
  "ORD-103": {
    order_id: "ORD-103",
    customer: "Ananya Patel",
    product: "Green Tea Face Wash + Toner",
    value: 850,
    status: "Processing",
    notes: "Ordered 3 hours ago. Eligible for cancellation",
  },
};

const WORDS = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };

export function getOrderDetails(rawId) {
  if (!rawId || !String(rawId).trim()) {
    return { error: "MISSING_ORDER_ID", message: "No order ID provided." };
  }
  const spoken = String(rawId)
    .toLowerCase()
    .replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => WORDS[w]);
  const digits = spoken.replace(/\D/g, "");
  const id = digits ? `ORD-${digits}` : String(rawId).toUpperCase().trim();
  const order = ORDERS[id];
  if (!order) {
    return { error: "ORDER_NOT_FOUND", message: `No order found for ${rawId}.` };
  }
  return order;
}