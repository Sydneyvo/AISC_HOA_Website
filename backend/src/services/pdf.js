const pdfParse = require('pdf-parse');
const crypto   = require('crypto');  // built into Node — no install needed

// Extract all text from a PDF buffer
async function extractPdfText(buffer) {
  const result = await pdfParse(buffer);
  return result.text;  // plain string of every word on every page
}

// MD5 hash of a file buffer — used to detect if the same file is re-uploaded
function hashFile(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

module.exports = { extractPdfText, hashFile };
