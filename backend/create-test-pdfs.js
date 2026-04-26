const fs = require('fs');
const path = require('path');

// Create a minimal PDF with text content
// This is a very basic PDF that pdf-parse can read

function createMinimalPDF(content, filename) {
  // Very basic PDF structure
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length ${content.length} >>
stream
BT
/F1 12 Tf
50 700 Td
(${content.replace(/\n/g, ') Tj\n0 -15 Td (')}) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000223 00000 n 
0000000309 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${412 + content.length}
%%EOF`;

  fs.writeFileSync(filename, pdf);
  console.log(`✓ Created ${filename}`);
}

// Create ICICI sample PDF
const iciciContent = `ICICI BANK LIMITED
STATEMENT OF ACCOUNT
01/04/2026 Opening Balance 0 100000.00
05/04/2026 Salary Credit - Employer 50000.00 0
07/04/2026 AMAZON.COM 2500.00 0
10/04/2026 SWIGGY FOOD 800.00 0
12/04/2026 UBER RIDE 250.00 0
15/04/2026 AMAZON.COM 5000.00 0
20/04/2026 ELECTRICITY BILL 1200.00 0
22/04/2026 ATM WITHDRAWAL 5000.00 0`;

createMinimalPDF(iciciContent, '/tmp/icici-sample.pdf');

// Create HDFC sample PDF
const hdfcContent = `HDFC BANK LIMITED
STATEMENT OF ACCOUNT
01-Apr-2026 Opening Balance 0 100000.00
05-Apr-2026 Salary Credit 50000.00 0
07-Apr-2026 AMAZON PURCHASE 2500.00 0
10-Apr-2026 SWIGGY ORDER 800.00 0
15-Apr-2026 SHOPPING 3000.00 0`;

createMinimalPDF(hdfcContent, '/tmp/hdfc-sample.pdf');

console.log('✓ Sample PDF files created successfully');
