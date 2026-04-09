// pages/api/qb/lapsed-customers.js
import { getValidTokens, qboQueryAll } from '../../../lib/quickbooks';
import ExcelJS from 'exceljs';

export default async function handler(req, res) {
  const monthsInactive = parseInt(req.query.months) || 18;
  const minLastOrder = parseFloat(req.query.min_amount) || 500;
  const format = req.query.format || 'xlsx';

  let tokens;
  try {
    tokens = await getValidTokens(req, res);
  } catch (err) {
    if (err.message === 'NO_TOKEN') {
      return res.status(401).json({
        error: 'Not connected to QuickBooks. Visit /api/qb/auth to connect.',
      });
    }
    return res.status(401).json({ error: err.message });
  }

  try {
    const customers = await qboQueryAll("SELECT * FROM Customer WHERE Active = true", tokens, req, res);

    const customerMap = {};
    for (const c of customers) {
      customerMap[c.Id] = {
        id: c.Id,
        name: c.DisplayName || c.FullyQualifiedName || '',
        email: c.PrimaryEmailAddr?.Address || '',
        company: c.CompanyName || '',
        totalSpent: 0,
        lastOrderDate: null,
        lastOrderAmount: 0,
        invoiceCount: 0,
      };
    }

    const invoices = await qboQueryAll("SELECT * FROM Invoice", tokens, req, res);

    for (const inv of invoices) {
      const custId = inv.CustomerRef?.value;
      if (!custId) continue;

      if (!customerMap[custId]) {
        customerMap[custId] = {
          id: custId,
          name: inv.CustomerRef?.name || `Customer ${custId}`,
          email: inv.BillEmail?.Address || '',
          company: '',
          totalSpent: 0,
          lastOrderDate: null,
          lastOrderAmount: 0,
          invoiceCount: 0,
        };
      }

      const c = customerMap[custId];
      const amount = parseFloat(inv.TotalAmt) || 0;
      const txnDate = inv.TxnDate ? new Date(inv.TxnDate) : null;

      c.totalSpent += amount;
      c.invoiceCount++;

      if (txnDate && (!c.lastOrderDate || txnDate > c.lastOrderDate)) {
        c.lastOrderDate = txnDate;
        c.lastOrderAmount = amount;
      }

      if (!c.email && inv.BillEmail?.Address) {
        c.email = inv.BillEmail.Address;
      }
    }

    try {
      const salesReceipts = await qboQueryAll("SELECT * FROM SalesReceipt", tokens, req, res);
      for (const sr of salesReceipts) {
        const custId = sr.CustomerRef?.value;
        if (!custId) continue;

        if (!customerMap[custId]) {
          customerMap[custId] = {
            id: custId,
            name: sr.CustomerRef?.name || `Customer ${custId}`,
            email: sr.BillEmail?.Address || '',
            company: '',
            totalSpent: 0,
            lastOrderDate: null,
            lastOrderAmount: 0,
            invoiceCount: 0,
          };
        }

        const c = customerMap[custId];
        const amount = parseFloat(sr.TotalAmt) || 0;
        const txnDate = sr.TxnDate ? new Date(sr.TxnDate) : null;

        c.totalSpent += amount;
        c.invoiceCount++;

        if (txnDate && (!c.lastOrderDate || txnDate > c.lastOrderDate)) {
          c.lastOrderDate = txnDate;
          c.lastOrderAmount = amount;
        }

        if (!c.email && sr.BillEmail?.Address) {
          c.email = sr.BillEmail.Address;
        }
      }
    } catch (e) {
      console.log('SalesReceipts query skipped:', e.message);
    }

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsInactive);

    const lapsedCustomers = Object.values(customerMap)
      .filter((c) => {
        if (!c.lastOrderDate) return false;
        return c.lastOrderDate < cutoffDate && c.lastOrderAmount >= minLastOrder;
      })
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((c) => ({
        name: c.name,
        email: c.email,
        company: c.company,
        totalSpent: Math.round(c.totalSpent * 100) / 100,
        lastOrderAmount: Math.round(c.lastOrderAmount * 100) / 100,
        lastOrderDate: c.lastOrderDate.toISOString().split('T')[0],
        daysSinceLastOrder: Math.floor(
          (Date.now() - c.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24)
        ),
        invoiceCount: c.invoiceCount,
      }));

    if (format === 'json') {
      return res.json({
        filters: { monthsInactive, minLastOrder },
        totalCustomers: customers.length,
        totalInvoices: invoices.length,
        lapsedCount: lapsedCustomers.length,
        customers: lapsedCustomers,
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TWG Lapsed Customer Tool';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Lapsed Customers');
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a2e' } };
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Arial' };

    sheet.columns = [
      { header: 'Customer Name', key: 'name', width: 30 },
      { header: 'Email', key: 'email', width: 35 },
      { header: 'Company', key: 'company', width: 30 },
      { header: 'Total Spent', key: 'totalSpent', width: 15 },
      { header: 'Last Order $', key: 'lastOrderAmount', width: 15 },
      { header: 'Last Order Date', key: 'lastOrderDate', width: 16 },
      { header: 'Days Since', key: 'daysSinceLastOrder', width: 12 },
      { header: 'Invoices', key: 'invoiceCount', width: 10 },
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    sheet.getRow(1).height = 24;

    for (const c of lapsedCustomers) {
      const row = sheet.addRow(c);
      row.getCell('totalSpent').numFmt = '$#,##0.00';
      row.getCell('lastOrderAmount').numFmt = '$#,##0.00';
      row.font = { name: 'Arial', size: 10 };
    }

    sheet.autoFilter = { from: 'A1', to: `H${lapsedCustomers.length + 1}` };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    summarySheet.getRow(1).eachCell((cell) => { cell.fill = headerFill; cell.font = headerFont; });

    const totalLapsedRevenue = lapsedCustomers.reduce((s, c) => s + c.totalSpent, 0);
    summarySheet.addRow({ metric: 'Report Generated', value: new Date().toISOString().split('T')[0] });
    summarySheet.addRow({ metric: 'Inactive Period (months)', value: monthsInactive });
    summarySheet.addRow({ metric: 'Min Last Order Amount', value: `$${minLastOrder}` });
    summarySheet.addRow({ metric: 'Total Active Customers', value: customers.length });
    summarySheet.addRow({ metric: 'Total Invoices Scanned', value: invoices.length });
    summarySheet.addRow({ metric: 'Lapsed Customers Found', value: lapsedCustomers.length });
    summarySheet.addRow({ metric: 'Total Lapsed Revenue', value: `$${totalLapsedRevenue.toLocaleString('en-CA', { minimumFractionDigits: 2 })}` });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `lapsed-customers-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Lapsed customers error:', err);
    res.status(500).json({ error: err.message });
  }
}
