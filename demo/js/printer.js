// Thermal Receipt printing service for DiningOS

// Format and execute browser print window for cashier receipts
export const printReceipt = (order, restaurant, currencySymbol = '₹') => {
  const restName = restaurant?.name || "Dev Cafe";
  const restDesc = restaurant?.description || "";
  const orderId = order.id || "TEMP-ID";
  const tableName = order.table_number || "Takeaway";
  
  // Calculate Totals
  const subtotal = order.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const taxRate = 0.05; // 5% GST
  const cgst = subtotal * (taxRate / 2);
  const sgst = subtotal * (taxRate / 2);
  const discount = order.discount || 0;
  const grandTotal = subtotal + cgst + sgst - discount;

  const dateStr = new Date(order.created_at?.toDate ? order.created_at.toDate() : new Date()).toLocaleString();

  // Create clean printable markup frame
  const printWindow = window.open('', '_blank', 'width=350,height=600');
  if (!printWindow) {
    alert("Please allow popups to open bill printing preview.");
    return;
  }

  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding: 4px 0; max-width: 140px; word-wrap: break-word;">${item.name}</td>
      <td style="padding: 4px 0; text-align: center;">x${item.quantity}</td>
      <td style="padding: 4px 0; text-align: right;">${currencySymbol}${parseFloat((item.price * item.quantity).toString()).toFixed(2)}</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt - #${orderId.slice(0, 8).toUpperCase()}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: 12px;
            color: #000;
            background: #fff;
            padding: 15px;
            width: 72mm; /* standard ticket width */
            margin: 0;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          .bold { font-weight: bold; }
          .header-title { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
          .footer-note { font-size: 10px; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="text-center">
          ${restaurant?.logoUrl ? `<img src="${restaurant.logoUrl}" style="max-height: 48px; border-radius: 8px; margin-bottom: 8px; filter: grayscale(100%);">` : ''}
          <div class="header-title">${restName.toUpperCase()}</div>
          ${restDesc ? `<div style="font-size: 10px; color: #333; margin-top: 2px; line-height: 1.3;">${restDesc}</div>` : ''}
          <div class="divider"></div>
          <div style="font-size: 11px; text-align: left; line-height: 1.5; margin: 4px 0;">
            <div><strong>Table:</strong> ${tableName.toUpperCase()}</div>
            <div><strong>Customer:</strong> ${order.customer_name || 'Guest'}</div>
            ${order.customer_mobile ? `<div><strong>Mobile:</strong> ${order.customer_mobile}</div>` : ''}
            <div><strong>Bill No:</strong> #${orderId.slice(0, 8).toUpperCase()}</div>
            <div><strong>Date:</strong> ${dateStr}</div>
          </div>
          <div class="divider"></div>
        </div>

        <table>
          <thead>
            <tr style="border-bottom: 1px dashed #000; font-weight: bold;">
              <th style="text-align: left; padding: 4px 0;">Item</th>
              <th style="text-align: center; padding: 4px 0; width: 40px;">Qty</th>
              <th style="text-align: right; padding: 4px 0; width: 60px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <table>
          <tr>
            <td style="padding: 2px 0;">Subtotal:</td>
            <td class="text-right" style="padding: 2px 0;">${currencySymbol}${subtotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 2px 0;">CGST (2.5%):</td>
            <td class="text-right" style="padding: 2px 0;">${currencySymbol}${cgst.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 2px 0;">SGST (2.5%):</td>
            <td class="text-right" style="padding: 2px 0;">${currencySymbol}${sgst.toFixed(2)}</td>
          </tr>
          ${discount > 0 ? `
          <tr>
            <td style="padding: 2px 0; color: #f00;">Discount:</td>
            <td class="text-right" style="padding: 2px 0; color: #f00;">-${currencySymbol}${discount.toFixed(2)}</td>
          </tr>` : ''}
          <tr class="bold" style="font-size: 13px;">
            <td style="padding: 4px 0; border-top: 1px dashed #000;">GRAND TOTAL:</td>
            <td class="text-right" style="padding: 4px 0; border-top: 1px dashed #000;">${currencySymbol}${grandTotal.toFixed(2)}</td>
          </tr>
        </table>

        <div class="divider"></div>
        
        <div class="text-center footer-note">
          <div>GSTIN: IN27AABC1234F1Z5</div>
          <div style="margin-top: 8px; font-weight: bold;">THANK YOU! VISIT AGAIN</div>
          <div style="font-size: 8px; color: #666; margin-top: 4px;">Powered by DiningOS</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
            // Automatically close preview tab after printing
            setTimeout(function() { window.close(); }, 500);
          }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
